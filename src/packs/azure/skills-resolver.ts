// ─── Agent Skills Resolver ───
// Fetches knowledge skills from the Microsoft agent-skills catalog
// based on what the user is asking about. These get injected into
// the LLM system prompt to provide domain expertise.

const SKILLS_BASE_URL =
  'https://raw.githubusercontent.com/MicrosoftDocs/agent-skills/main/skills';

// Map of trigger keywords → skill folder names
const SKILL_TRIGGERS: Record<string, string[]> = {
  // Compute
  'kubernetes|aks|k8s|managed cluster': ['azure-kubernetes-service'],
  'vm|virtual machine|compute': ['azure-virtual-machines'],
  'container app|containerapp': ['azure-container-apps'],
  'function|serverless|azure functions': ['azure-functions'],
  'app service|web app|webapp': ['azure-app-service'],

  // Data
  'cosmos|cosmosdb|nosql': ['azure-cosmos-db'],
  'sql|database|azure sql': ['azure-sql'],
  'storage|blob|file share': ['azure-storage'],
  'redis|cache': ['azure-cache-for-redis'],

  // AI
  'openai|cognitive|ai service': ['azure-openai-service'],
  'machine learning|ml|mlops': ['azure-machine-learning'],

  // Networking
  'vnet|virtual network|networking|nsg': ['azure-virtual-network'],
  'load balancer|application gateway|front door': ['azure-networking'],
  'dns|private endpoint': ['azure-dns'],

  // DevOps & Management
  'devops|pipeline|ci/cd': ['azure-devops'],
  'monitor|log analytics|application insights': ['azure-monitor'],
  'key vault|secret|certificate': ['azure-key-vault'],
  'policy|governance|rbac|role': ['azure-policy'],
  'resource manager|arm|bicep|template': ['azure-resource-manager'],
};

// Map of keywords → ARM resource types for schema injection
const RESOURCE_TYPE_TRIGGERS: Record<string, { resourceType: string; apiVersion: string }> = {
  'aks|kubernetes|managed cluster|managedcluster': {
    resourceType: 'Microsoft.ContainerService/managedClusters',
    apiVersion: '2024-01-01',
  },
  'app service|web app|webapp|microsoft.web/sites': {
    resourceType: 'Microsoft.Web/sites',
    apiVersion: '2023-12-01',
  },
  'container app|containerapp': {
    resourceType: 'Microsoft.App/containerApps',
    apiVersion: '2024-03-01',
  },
  'acr|container registry': {
    resourceType: 'Microsoft.ContainerRegistry/registries',
    apiVersion: '2023-07-01',
  },
  'cosmos|cosmosdb': {
    resourceType: 'Microsoft.DocumentDB/databaseAccounts',
    apiVersion: '2024-02-15-preview',
  },
  'sql server|azure sql': {
    resourceType: 'Microsoft.Sql/servers',
    apiVersion: '2023-08-01-preview',
  },
  'storage account': {
    resourceType: 'Microsoft.Storage/storageAccounts',
    apiVersion: '2023-05-01',
  },
  'key vault|keyvault': {
    resourceType: 'Microsoft.KeyVault/vaults',
    apiVersion: '2023-07-01',
  },
  'role assignment|rbac|acrpull|acr pull|permission|principalid': {
    resourceType: 'Microsoft.Authorization/roleAssignments',
    apiVersion: '2022-04-01',
  },
};

const skillCache = new Map<string, string>();

/** Resolve relevant Azure skills for a given prompt */
export async function resolveAzureSkills(prompt: string): Promise<string | null> {
  const lower = prompt.toLowerCase();
  const matched = new Set<string>();

  for (const [pattern, skills] of Object.entries(SKILL_TRIGGERS)) {
    const parts = pattern.split('|');
    if (parts.some((p) => lower.includes(p))) {
      for (const skill of skills) {
        matched.add(skill);
      }
    }
  }

  if (matched.size === 0) return null;

  const results: string[] = [];
  for (const skillName of matched) {
    const content = await fetchSkillContent(skillName);
    if (content) {
      results.push(content);
    }
  }

  // Also inject ARM resource schemas when deploying/creating resources
  const deployKeywords = ['deploy', 'create', 'provision', 'put ', 'azurequery', 'bicep', 'template', 'infrastructure', 'role', 'rbac', 'acr pull', 'acrpull', 'permission'];
  const isDeployContext = deployKeywords.some((kw) => lower.includes(kw));
  if (isDeployContext) {
    const schemas = resolveArmSchemas(lower);
    if (schemas.length > 0) {
      results.push(...schemas);
    }
  }

  return results.length > 0
    ? `\n--- AZURE DOMAIN KNOWLEDGE ---\n${results.join('\n\n')}`
    : null;
}

async function fetchSkillContent(skillName: string): Promise<string | null> {
  // Check cache
  if (skillCache.has(skillName)) {
    return skillCache.get(skillName)!;
  }

  try {
    // Try fetching the skill's SKILL.md
    const url = `${SKILLS_BASE_URL}/${skillName}/SKILL.md`;
    const res = await fetch(url);
    if (!res.ok) return null;

    let content = await res.text();

    // Trim to a reasonable size for system prompt injection (max ~2000 chars)
    if (content.length > 2000) {
      // Keep the first section (usually the most useful part)
      const sections = content.split('\n## ');
      content = sections[0];
      if (sections.length > 1) {
        // Include key sections if they fit
        for (let i = 1; i < sections.length && content.length < 2000; i++) {
          const section = '## ' + sections[i];
          if (content.length + section.length < 2500) {
            content += '\n' + section;
          }
        }
      }
    }

    const result = `[${skillName}]\n${content}`;
    skillCache.set(skillName, result);
    return result;
  } catch {
    return null;
  }
}

/** Clear the skills cache */
export function clearSkillsCache(): void {
  skillCache.clear();
}

// ─── ARM Schema Injection ───
// When the conversation is about deploying/creating resources,
// inject the ARM PUT body template so the LLM knows the correct shape.

function resolveArmSchemas(prompt: string): string[] {
  const results: string[] = [];

  for (const [pattern, info] of Object.entries(RESOURCE_TYPE_TRIGGERS)) {
    const parts = pattern.split('|');
    if (parts.some((p) => prompt.includes(p))) {
      const template = ARM_BODY_TEMPLATES[info.resourceType];
      if (template && template !== 'SPECIAL') {
        results.push(
          `[ARM PUT Body Template for ${info.resourceType} (api-version=${info.apiVersion})]\n` +
          `When creating this resource with azureQuery PUT, use this body structure:\n` +
          '```json\n' + template + '\n```\n' +
          `API path: /subscriptions/{{st.__azureSubscription}}/resourceGroups/{{st.rg}}/providers/${info.resourceType}/{name}?api-version=${info.apiVersion}`
        );
      } else if (info.resourceType === 'Microsoft.Authorization/roleAssignments') {
        results.push(
          `[ARM Role Assignment Rules]\n` +
          `Role assignments have special ARM requirements:\n` +
          `1. The ID in the URL path MUST be a GUID (use crypto.randomUUID() or a deterministic GUID)\n` +
          `2. The API path scope must MATCH the scope in the body.\n` +
          `   - To scope to a specific resource (e.g., ACR): PUT on /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.ContainerRegistry/registries/{acrName}/providers/Microsoft.Authorization/roleAssignments/{guid}\n` +
          `   - To scope to a resource group: PUT on /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Authorization/roleAssignments/{guid}\n` +
          `3. Body: { "properties": { "roleDefinitionId": "/subscriptions/{sub}/providers/Microsoft.Authorization/roleDefinitions/{roleId}", "principalId": "{managedIdentityPrincipalId}" } }\n` +
          `4. Common role IDs: AcrPull=7f951dda-4ed3-4680-a7ca-43fe172d538d, AcrPush=8311e382-0749-4cb8-b61a-304f252e45ec, Contributor=b24988ac-6180-42a0-ab88-20f7382dd24c\n` +
          `5. api-version=2022-04-01`
        );
      }
    }
  }

  return results;
}

// Minimal correct PUT body templates for common resource types.
// These are the minimum required fields for a successful ARM PUT.
const ARM_BODY_TEMPLATES: Record<string, string> = {
  'Microsoft.ContainerService/managedClusters': JSON.stringify({
    location: '{{location}}',
    properties: {
      dnsPrefix: '{{dnsPrefix}}',
      agentPoolProfiles: [{
        name: 'nodepool1',
        count: 2,
        vmSize: 'Standard_B2s',
        mode: 'System',
        osType: 'Linux',
        type: 'VirtualMachineScaleSets',
      }],
      networkProfile: {
        networkPlugin: 'azure',
        loadBalancerSku: 'standard',
      },
    },
  }, null, 2),

  'Microsoft.Web/sites': JSON.stringify({
    location: '{{location}}',
    kind: 'app,linux',
    properties: {
      serverFarmId: '{{appServicePlanId}}',
      siteConfig: {
        linuxFxVersion: 'DOTNETCORE|8.0',
      },
      httpsOnly: true,
    },
  }, null, 2),

  'Microsoft.ContainerRegistry/registries': JSON.stringify({
    location: '{{location}}',
    sku: { name: 'Basic' },
    properties: {
      adminUserEnabled: false,
    },
  }, null, 2),

  'Microsoft.App/containerApps': JSON.stringify({
    location: '{{location}}',
    properties: {
      managedEnvironmentId: '{{managedEnvironmentId}}',
      configuration: {
        ingress: {
          external: true,
          targetPort: 8080,
          transport: 'auto',
        },
      },
      template: {
        containers: [{
          name: '{{appName}}',
          image: '{{image}}',
          resources: { cpu: 0.5, memory: '1Gi' },
        }],
        scale: { minReplicas: 1, maxReplicas: 3 },
      },
    },
  }, null, 2),

  'Microsoft.Storage/storageAccounts': JSON.stringify({
    location: '{{location}}',
    sku: { name: 'Standard_LRS' },
    kind: 'StorageV2',
    properties: {
      supportsHttpsTrafficOnly: true,
      minimumTlsVersion: 'TLS1_2',
    },
  }, null, 2),

  'Microsoft.KeyVault/vaults': JSON.stringify({
    location: '{{location}}',
    properties: {
      tenantId: '{{tenantId}}',
      sku: { family: 'A', name: 'standard' },
      accessPolicies: [],
      enableRbacAuthorization: true,
      enableSoftDelete: true,
      softDeleteRetentionInDays: 90,
    },
  }, null, 2),

  'Microsoft.Authorization/roleAssignments': 'SPECIAL',
};
