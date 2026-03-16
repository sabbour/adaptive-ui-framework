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
