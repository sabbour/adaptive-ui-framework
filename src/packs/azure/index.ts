import type { ComponentPack, IntentResolverEntry } from '../../framework/registry';
import type { AdaptiveNode } from '../../framework/schema';
import { AzureResourceForm, AzureLogin, AzureQuery, AzurePicker } from './components';
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

You have access to Azure-specific capabilities. When the user discusses Azure services,
use these features to provide a better experience.

TOOLS (called during inference, before generating UI):
- azure_arm_get: Read-only ARM API caller. Use ONLY when you need to SEE the data to make decisions
  (e.g., check existing resources, validate configuration, read resource properties).
  Do NOT use this tool to list regions, resource groups, or SKUs for the user to pick from — use azurePicker instead.
  Requires the user to be signed in (azureLogin component must have been shown first).
  Example: azure_arm_get({ path: "/subscriptions/{sub}/providers/Microsoft.ContainerService/managedClusters?api-version=2024-01-01" })

COMPONENTS (use in "ask" as { type: "component", component: "name", props: {} } — NEVER in "show"):
- "azureLogin": { title?, description? }
    Inline sign-in card. Shows a "Sign in with Microsoft" button that opens a popup.
    On success, sets __azureToken in state automatically.
    Also fetches Azure subscriptions and stores them in __azureSubscriptions (JSON array of {id, name}).
    If only one subscription exists, auto-selects it into __azureSubscription and __azureSubscriptionName.
    If multiple subscriptions exist, shows a subscription picker.
    If already signed in, shows a green "Signed in" confirmation with subscription info.
    Use this FIRST whenever Azure resources are needed and __azureToken is not set.
    This is a self-managed component — do NOT include a "next" prompt for sign-in steps.

- "azureResourceForm": { resourceType: "Microsoft.ContainerService/managedClusters" | "Microsoft.Web/sites" | ..., bind: "stateKey" }
    Dynamically generates a form by fetching the ARM resource type schema at runtime.
    Fields are discovered from the Azure resource provider metadata — nothing is hardcoded.
    Form field values are stored as {bind}_{propertyName} in state.
    Requires __azureToken and __azureSubscription in state.

For other Azure inputs (regions, resource groups, SKUs), ALWAYS use azurePicker — never hardcode options in a select or use azureQuery/azure_arm_get to fetch lists for selection.

- "azurePicker": { api, bind, label?, labelKey?, valueKey?, filterKey?, filterValue?, labelBind?, itemsPath?, loadingLabel? }
    Dropdown that fetches options from an ARM API endpoint at render time.
    Use this for ANY Azure list that should come from the API (regions, resource groups, SKUs, etc.).
    DO NOT hardcode Azure regions, resource groups, or other API-populated lists in a "select" — always use azurePicker instead.
    
    Examples:
    - Azure regions:
      { type: "azurePicker", api: "/subscriptions/{{state.__azureSubscription}}/locations?api-version=2022-12-01", bind: "region", label: "Azure Region", labelKey: "displayName", valueKey: "name", filterKey: "metadata.regionType", filterValue: "Physical" }
    - Resource groups:
      { type: "azurePicker", api: "/subscriptions/{{state.__azureSubscription}}/resourcegroups?api-version=2022-09-01", bind: "resourceGroup", label: "Resource Group", labelKey: "name", valueKey: "name" }

    In compact notation, the type is "azurePicker" (no alias).

- "azureQuery": { api: "/subscriptions/{{st.__azureSubscription}}/resourceGroups?api-version=2022-09-01", bind: "stateKey", method?: "GET"|"PUT"|"POST"|"DELETE"|"PATCH", body?: "json string", loadingLabel?, showResult?, confirm? }
    Generic ARM API caller for WRITE operations (PUT/POST/DELETE/PATCH) with user confirmation.
    Use for creating, updating, or deleting Azure resources.
    Do NOT use azureQuery for read-only data fetching — use azurePicker for selection lists or azure_arm_get tool when the LLM needs to see the data.
    The API path supports {{state.key}} interpolation for dynamic values.
    Write operations show a confirmation dialog first.
    Results are stored as JSON string under the bind key.
    
    Common API paths for writes:
    - Create a resource: method "PUT" with body containing the resource definition
    - Delete a resource: method "DELETE"
    - Update a resource: method "PATCH" with body containing the update

    ARM API rules:
    - Role assignment IDs (Microsoft.Authorization/roleAssignments) MUST be GUIDs, not human-readable names. Generate a deterministic GUID from the inputs (e.g., resource ID + principal ID + role ID).
    - The "body" field is a JSON string with {{st.key}} interpolation. Use actual state keys from the current conversation, not invented shorthand keys.
    - Always use __azureSubscription for the subscription ID in API paths.

When the user mentions deploying an Azure resource:
1. If __azureToken is not set, show azureLogin component first
2. Use azurePicker for resource group and region selection (NEVER hardcode these in a select)
3. Use azureResourceForm for resource-specific configuration
4. Show a summary and confirm

AZURE INFRASTRUCTURE AS CODE:
When generating IaC for Azure, use Bicep (.bicep) unless the user explicitly requests Terraform.

Bicep file structure:
1. main.bicep — Orchestrator that references modules, defines parameters
2. modules/*.bicep — One module per logical group (networking, compute, data, security, monitoring)
3. parameters.json — Default parameter values for the target environment
4. deploy.sh — CLI deployment script (az deployment group create)

Bicep best practices:
- Use \`param\` with types and defaults for all configurable values (region, SKU, app name)
- Use \`module\` keyword to compose modules from the main file
- Tag all resources with environment, project, and managed-by
- Use managed identity instead of connection strings where possible
- Configure diagnostic settings to send logs to Log Analytics
- Use \`@secure()\` decorator for secrets, reference Key Vault where possible
- Include \`output\` for important values (endpoints, resource IDs, connection strings)

DO NOT call ARM APIs directly to create resources. Always generate IaC files instead.
The only acceptable API calls are read-only queries (azure_arm_get tool) to check existing infrastructure.

AZURE CI/CD:
- If the user prefers Azure DevOps, generate azure-pipelines.yml instead of GitHub Actions
- For AKS workloads, prefer GitOps with Flux v2 (Azure supports Flux as a first-party AKS extension)
- Use Azure federated credentials (OIDC) for pipeline-to-Azure authentication — no stored secrets

AZURE ARCHITECTURE DIAGRAM ICONS:
When generating diagrams, prefix node labels with %%icon:ICON_NAME%% using these icons:
azure/aks, azure/vm, azure/vmss, azure/container-instances, azure/acr, azure/sql, azure/cosmos-db, azure/postgresql, azure/mysql, azure/redis, azure/vnet, azure/load-balancer, azure/app-gateway, azure/front-door, azure/dns, azure/firewall, azure/nsg, azure/app-service, azure/function-app, azure/storage, azure/key-vault, azure/monitor, azure/log-analytics, azure/cognitive-services, azure/event-grid, azure/api-management, azure/subscription, azure/resource-group

Working diagram example:
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
                  description: 'ARM API path starting with /subscriptions/... Include api-version parameter. Example: /subscriptions/{sub-id}/resourceGroups?api-version=2022-09-01',
                },
              },
              required: ['path'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const acct = await getActiveAccount();
          if (!acct) return 'Error: User is not signed in to Azure. Show the azureLogin component first.';
          const path = String(args.path);
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
