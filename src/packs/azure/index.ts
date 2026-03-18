import type { ComponentPack, IntentResolverEntry } from '../../framework/registry';
import type { AdaptiveNode } from '../../framework/schema';
import { AzureResourceForm, AzureLogin, AzureQuery, AzurePicker, getActiveSubscriptionId, setActiveSubscriptionId } from './components';
import { fetchSubscriptions } from './arm-introspection';
import { AzureSettings } from './AzureSettings';
import { resolveAzureSkills } from './skills-resolver';
import { trackedFetch } from '../../framework/request-tracker';
import { getActiveAccount } from './auth';
import './css/azure-theme.css';

// ─── Azure Component Pack ───
// Minimal pack: one dynamic component + knowledge skills from the agent-skills catalog.
//
// - azureResourceForm: auto-generates forms from ARM provider metadata (no hardcoded schemas)
// - resolveSkills: fetches relevant Azure domain knowledge from the agent-skills catalog
//   based on what the user is asking about (AKS, App Service, etc.)
//
// Prerequisites:
// - Set `__azureToken` in state with a valid Azure access token
// - Set `__azureSubscription` in state with the subscription ID

const AZURE_SYSTEM_PROMPT = `
AZURE CLOUD PACK:

RUNTIME BEHAVIOR:
- Past turns render as read-only snapshots in disabled context. Component side effects are suppressed there.
- If you need fresh API-loaded UI (pickers/forms), emit those components in the CURRENT active turn.

TOOLS (inference-time, LLM sees results):
- azure_arm_get: Read-only ARM API query. Use ONLY when you need data to reason about (check resources, validate config). NOT for selection lists. Requires sign-in.

COMPONENTS (use in "ask" as {type:"component",component:"name",props:{}}):

azureLogin — {title?,description?}
  Sign-in card with "Sign in with Microsoft" popup. Sets __azureToken, fetches __azureSubscriptions. Auto-selects single subscription. Self-managed — omit "next".
  Show FIRST when Azure resources needed and __azureToken not set.

azureResourceForm — {resourceType:"Microsoft.ContainerService/managedClusters"|..., bind:"key"}
  Dynamic form from ARM resource type schema. Stores values as {bind}_{prop}. Requires __azureToken + __azureSubscription.

azurePicker — {api, bind, label?, labelKey?, valueKey?, filterKey?, filterValue?, labelBind?, itemsPath?, loadingLabel?}
  Dropdown fetching options from ARM endpoint at render time. ALWAYS use for regions, resource groups, SKUs — NEVER hardcode in select.
  Region example: {type:"azurePicker", api:"/subscriptions/{{state.__azureSubscription}}/locations?api-version=2022-12-01", bind:"region", label:"Azure Region", labelKey:"displayName", valueKey:"name", filterKey:"metadata.regionType", filterValue:"Physical"}
  RG example: {type:"azurePicker", api:"/subscriptions/{{state.__azureSubscription}}/resourcegroups?api-version=2022-09-01", bind:"resourceGroup", label:"Resource Group", labelKey:"name", valueKey:"name"}

azureQuery — {api, bind, method?:"GET"|"PUT"|"POST"|"DELETE"|"PATCH", body?, loadingLabel?, showResult?, confirm?}
  ARM API caller for WRITES with user confirmation. NOT for reads — use azurePicker/azure_arm_get.
  API path supports {{state.key}}. Write ops show confirm dialog. Results stored as JSON under bind key.
  Rules: role assignment IDs must be GUIDs, body is JSON string with {{st.key}}, use __azureSubscription in paths.

Deploy flow: 1) azureLogin if no token → 2) azurePicker for RG + region → 3) azureResourceForm for config → 4) summary + confirm

IaC: Use Bicep unless user requests Terraform.
Structure: main.bicep (orchestrator), modules/*.bicep (per concern), parameters.json, deploy.sh
Practices: param with types/defaults, module composition, tag resources, managed identity, diagnostic→Log Analytics, @secure() for secrets, output endpoints/IDs.
Do NOT call ARM APIs to create resources — generate IaC instead. Read-only queries OK.

CI/CD: Azure DevOps → azure-pipelines.yml. AKS → Flux v2 GitOps. Use OIDC federated credentials.

DIAGRAM ICONS (prefix with %%icon:NAME%%):
azure/aks, azure/vm, azure/vmss, azure/container-instances, azure/acr, azure/sql, azure/cosmos-db, azure/postgresql, azure/mysql, azure/redis, azure/vnet, azure/load-balancer, azure/app-gateway, azure/front-door, azure/dns, azure/firewall, azure/nsg, azure/app-service, azure/function-app, azure/storage, azure/key-vault, azure/monitor, azure/log-analytics, azure/cognitive-services, azure/event-grid, azure/api-management, azure/subscription, azure/resource-group

Diagram example:
"flowchart TD\\n  User([\\"User\\"])\\n  subgraph networking[\\"Networking\\"]\\n    DNS[\\"%%icon:azure/dns%%DNS\\"]\\n    FD[\\"%%icon:azure/front-door%%Front Door\\"]\\n  end\\n  subgraph compute[\\"Compute\\"]\\n    App[\\"%%icon:azure/app-service%%App Service\\"]\\n  end\\n  subgraph data[\\"Data\\"]\\n    SQL[\\"%%icon:azure/sql%%SQL\\"]\\n    Redis[\\"%%icon:azure/redis%%Redis\\"]\\n  end\\n  User --> DNS --> FD --> App\\n  App --> SQL\\n  App --> Redis"`;

export function createAzurePack(): ComponentPack {
  return {
    name: 'azure',
    displayName: 'Azure Cloud',
    components: {
      azureLogin: AzureLogin,
      azureResourceForm: AzureResourceForm,
      azureQuery: AzureQuery,
      azQuery: AzureQuery,
      azurePicker: AzurePicker,
    },
    systemPrompt: AZURE_SYSTEM_PROMPT,
    resolveSkills: resolveAzureSkills,
    settingsComponent: AzureSettings,
    intentResolvers: {
      'azure-regions': {
        description: 'Pick an Azure region (fetched from ARM API)',
        props: 'key, label?',
        resolve: (ask) => ({
          type: 'azurePicker',
          api: '/subscriptions/{{state.__azureSubscription}}/locations?api-version=2022-12-01',
          bind: (ask.key ?? ask.bind) as string,
          label: (ask.label as string) ?? 'Azure Region',
          labelKey: 'displayName',
          valueKey: 'name',
          filterKey: 'metadata.regionType',
          filterValue: 'Physical',
          loadingLabel: 'Loading Azure regions...',
        } as unknown as AdaptiveNode),
      },
      'azure-resource-groups': {
        description: 'Pick an Azure resource group (fetched from ARM API)',
        props: 'key, label?',
        resolve: (ask) => ({
          type: 'azurePicker',
          api: '/subscriptions/{{state.__azureSubscription}}/resourcegroups?api-version=2022-09-01',
          bind: (ask.key ?? ask.bind) as string,
          label: (ask.label as string) ?? 'Resource Group',
          labelKey: 'name',
          valueKey: 'name',
          loadingLabel: 'Loading resource groups...',
        } as unknown as AdaptiveNode),
      },
      'azure-skus': {
        description: 'Pick SKU/tier for an Azure resource type (fetched from ARM metadata)',
        props: 'key, resourceType, label?',
        resolve: (ask) => ({
          type: 'azureResourceForm',
          resourceType: ask.resourceType,
          bind: (ask.key ?? ask.bind) as string,
        } as unknown as AdaptiveNode),
      },
      'azure-subscriptions': {
        description: 'Pick an Azure subscription (fetched from ARM API)',
        props: 'key, label?',
        resolve: (ask) => ({
          type: 'azurePicker',
          api: '/subscriptions?api-version=2022-12-01',
          bind: (ask.key ?? ask.bind) as string,
          labelBind: `${String(ask.key ?? ask.bind)}Name`,
          label: (ask.label as string) ?? 'Azure Subscription',
          labelKey: 'displayName',
          valueKey: 'subscriptionId',
          filterKey: 'state',
          filterValue: 'Enabled',
          loadingLabel: 'Loading subscriptions...',
        } as unknown as AdaptiveNode),
      },
    },
    tools: [
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'azure_arm_get',
            description: 'Call the Azure Resource Manager REST API (GET only). Use to list existing resources, check infrastructure state, or read configuration before generating the UI response. Requires the user to have signed in via azureLogin first.',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'ARM API path starting with /subscriptions/... Include api-version parameter. Use {sub-id} as a placeholder for the active subscription ID — it will be resolved automatically. Example: /subscriptions/{sub-id}/resourceGroups?api-version=2022-09-01',
                },
              },
              required: ['path'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const acct = await getActiveAccount();
          if (!acct) return 'Error: User is not signed in to Azure. Show the azureLogin component first.';
          let path = String(args.path);
          // Auto-inject the active subscription ID into placeholder patterns
          let subId = getActiveSubscriptionId();
          // If not set yet (e.g. session restored before component mounted), resolve from API
          if (!subId && path.includes('{sub-id}') || path.includes('{subscription-id}') || path.includes('{subscriptionId}')) {
            try {
              const subs = await fetchSubscriptions(acct.accessToken);
              const enabled = subs.filter((s) => s.state === 'Enabled');
              if (enabled.length > 0) {
                subId = enabled[0].id;
                setActiveSubscriptionId(subId);
              }
            } catch { /* fall through — placeholder will remain and ARM will return a clear error */ }
          }
          if (subId) {
            path = path.split('{sub-id}').join(subId)
              .split('{subscription-id}').join(subId)
              .split('{subscriptionId}').join(subId);
          }
          const url = `https://management.azure.com${path.startsWith('/') ? '' : '/'}${path}`;
          try {
            const res = await trackedFetch(url, {
              headers: { Authorization: `Bearer ${acct.accessToken}`, Accept: 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) return `ARM API error (${res.status}): ${data?.error?.message ?? JSON.stringify(data)}`;
            const text = JSON.stringify(data, null, 2);
            return text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text;
          } catch (err) {
            return `Failed to call ARM API: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}

export { clearSchemaCache } from './arm-introspection';
export { clearSkillsCache } from './skills-resolver';
export { azureLogin, azureLogout, getActiveAccount } from './auth';
export type { AzureAuthResult } from './auth';
export { getAzureIconUrl, getAzureIconByKeyword } from './icon-resolver';
