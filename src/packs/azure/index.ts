import type { ComponentPack, IntentResolverEntry } from '../../framework/registry';
import type { AdaptiveNode } from '../../framework/schema';
import { AzureResourceForm, AzureLogin, AzureQuery, AzurePicker } from './components';
import { AzureSettings } from './AzureSettings';
import { resolveAzureSkills } from './skills-resolver';
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

For other Azure inputs (regions, resource groups, SKUs), use generic components (select, radioGroup)
and populate them by asking the user — the LLM has Azure domain knowledge injected dynamically.

- "azureQuery": { api: "/subscriptions/{{st.__azureSubscription}}/resourceGroups?api-version=2022-09-01", bind: "stateKey", method?: "GET"|"PUT"|"POST"|"DELETE"|"PATCH", body?: "json string", loadingLabel?, showResult?, confirm? }
    Generic ARM API caller. Executes the API call at render time and stores the result in state.
    The API path supports {{state.key}} interpolation for dynamic values.
    GET requests auto-execute on mount. Write operations (PUT/POST/DELETE/PATCH) show a confirmation dialog first.
    Results are stored as JSON string under the bind key.
    Use this for ANY ARM operation: listing resources, creating resources, fetching details, etc.
    
    Common API paths:
    - List resource groups: /subscriptions/{{st.__azureSubscription}}/resourcegroups?api-version=2022-09-01
    - List AKS clusters: /subscriptions/{{st.__azureSubscription}}/providers/Microsoft.ContainerService/managedClusters?api-version=2024-01-01
    - List web apps: /subscriptions/{{st.__azureSubscription}}/providers/Microsoft.Web/sites?api-version=2023-12-01
    - Get a resource: /subscriptions/{{st.__azureSubscription}}/resourceGroups/{rg}/providers/{type}/{name}?api-version=...
    - Create a resource: method "PUT" with body containing the resource definition

    ARM API rules:
    - Role assignment IDs (Microsoft.Authorization/roleAssignments) MUST be GUIDs, not human-readable names. Generate a deterministic GUID from the inputs (e.g., resource ID + principal ID + role ID).
    - The "body" field is a JSON string with {{st.key}} interpolation. Use actual state keys from the current conversation, not invented shorthand keys.
    - Always use __azureSubscription for the subscription ID in API paths.

When the user mentions deploying an Azure resource:
1. If __azureToken is not set, show azureLogin component first
2. Ask for subscription, resource group and region using generic inputs
3. Use azureResourceForm for resource-specific configuration
4. Show a summary and confirm`;

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
  };
}

export { clearSchemaCache } from './arm-introspection';
export { clearSkillsCache } from './skills-resolver';
export { azureLogin, azureLogout, getActiveAccount } from './auth';
export type { AzureAuthResult } from './auth';
export { getAzureIconUrl, getAzureIconByKeyword } from './icon-resolver';
