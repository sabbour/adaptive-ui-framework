// ─── Azure Icon Resolver ───
// Maps ARM resource types / service names to Azure service icon SVGs.
// Icons are from the official Azure architecture icons set.

// Namespace → icon category folder mapping
const NAMESPACE_TO_CATEGORY: Record<string, string> = {
  'Microsoft.Compute': 'Compute',
  'Microsoft.ContainerService': 'Compute',
  'Microsoft.App': 'Containers',
  'Microsoft.ContainerInstance': 'Containers',
  'Microsoft.ContainerRegistry': 'Containers',
  'Microsoft.Web': 'Web',
  'Microsoft.Sql': 'Databases',
  'Microsoft.DBforMySQL': 'Databases',
  'Microsoft.DBforPostgreSQL': 'Databases',
  'Microsoft.DocumentDB': 'IoT', // Cosmos DB is under IoT in the icon set
  'Microsoft.Storage': 'Storage',
  'Microsoft.Network': 'Networking',
  'Microsoft.KeyVault': 'Security',
  'Microsoft.CognitiveServices': 'AI + Machine Learning',
  'Microsoft.MachineLearningServices': 'AI + Machine Learning',
  'Microsoft.Cache': 'Databases',
  'Microsoft.Devices': 'IoT',
  'Microsoft.EventHub': 'Analytics',
  'Microsoft.ServiceBus': 'Integration',
  'Microsoft.OperationalInsights': 'Analytics',
  'Microsoft.Monitor': 'Management + Governance',
  'Microsoft.Authorization': 'Identity',
  'Microsoft.ManagedIdentity': 'Identity',
};

// ARM resource type → specific icon filename
const RESOURCE_TYPE_TO_ICON: Record<string, string> = {
  'Microsoft.ContainerService/managedClusters': 'Compute/Kubernetes Services',
  'Microsoft.Web/sites': 'Web/App Services',
  'Microsoft.Web/serverFarms': 'App Services/App Service Plans',
  'Microsoft.Compute/virtualMachines': 'Compute/Virtual Machine',
  'Microsoft.App/containerApps': 'Containers/Container Instances',
  'Microsoft.ContainerRegistry/registries': 'Containers/Container Registries',
  'Microsoft.Sql/servers': 'Databases/SQL Server',
  'Microsoft.Sql/servers/databases': 'Databases/SQL Database',
  'Microsoft.DocumentDB/databaseAccounts': 'IoT/Azure Cosmos DB',
  'Microsoft.Storage/storageAccounts': 'Storage/Storage Accounts',
  'Microsoft.KeyVault/vaults': 'Security/Key Vaults',
  'Microsoft.Network/virtualNetworks': 'Networking/Virtual Networks',
  'Microsoft.Network/loadBalancers': 'Networking/Load Balancers',
  'Microsoft.Network/applicationGateways': 'Networking/Application Gateways',
  'Microsoft.CognitiveServices/accounts': 'AI + Machine Learning/Cognitive Services',
  'Microsoft.MachineLearningServices/workspaces': 'AI + Machine Learning/Machine Learning',
  'Microsoft.Cache/redis': 'Databases/Azure Cache For Redis',
  'Microsoft.Devices/IotHubs': 'IoT/IoT Hub',
  'Microsoft.Web/sites/functions': 'IoT/Function Apps',
};

// Keyword → icon path for general lookups
const KEYWORD_TO_ICON: Record<string, string> = {
  kubernetes: 'Compute/Kubernetes Services',
  aks: 'Compute/Kubernetes Services',
  'virtual machine': 'Compute/Virtual Machine',
  vm: 'Compute/Virtual Machine',
  'app service': 'Web/App Services',
  webapp: 'Web/App Services',
  function: 'IoT/Function Apps',
  serverless: 'IoT/Function Apps',
  sql: 'Databases/Azure SQL',
  cosmos: 'IoT/Azure Cosmos DB',
  storage: 'Storage/Storage Accounts',
  'key vault': 'Security/Key Vaults',
  container: 'Containers/Container Instances',
  registry: 'Containers/Container Registries',
  'load balancer': 'Networking/Load Balancers',
  vnet: 'Networking/Virtual Networks',
  cognitive: 'AI + Machine Learning/Cognitive Services',
  openai: 'AI + Machine Learning/Azure OpenAI',
  'machine learning': 'AI + Machine Learning/Machine Learning',
  redis: 'Databases/Azure Cache For Redis',
  iot: 'IoT/IoT Hub',
};

const ICONS_BASE = new URL('./icons/', import.meta.url).href;

/** Get the icon URL for an ARM resource type */
export function getAzureIconUrl(resourceType: string): string | null {
  // 1. Exact match
  const exact = RESOURCE_TYPE_TO_ICON[resourceType];
  if (exact) {
    return `${ICONS_BASE}${encodeURIPath(exact)}.svg`;
  }

  // 2. Namespace category match — try to fuzzy match the type name
  const namespace = resourceType.split('/')[0];
  const category = NAMESPACE_TO_CATEGORY[namespace];
  if (category) {
    return `${ICONS_BASE}${encodeURIComponent(category)}/Azure%20Default.svg`;
  }

  return null;
}

/** Get icon URL by keyword/service name */
export function getAzureIconByKeyword(keyword: string): string | null {
  const lower = keyword.toLowerCase();
  for (const [key, path] of Object.entries(KEYWORD_TO_ICON)) {
    if (lower.includes(key)) {
      return `${ICONS_BASE}${encodeURIPath(path)}.svg`;
    }
  }
  return null;
}

function encodeURIPath(path: string): string {
  return path.split('/').map((p) => encodeURIComponent(p)).join('/');
}
