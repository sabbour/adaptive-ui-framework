import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createAzurePack } from '../packs/azure';
import { createGitHubPack } from '../packs/github';
import { SessionsSidebar } from '../framework/components/SessionsSidebar';
import { FileViewer, FileViewerPlaceholder } from '../framework/components/FileViewer';
import { ResizeHandle } from '../framework/components/ResizeHandle';
import { generateSessionId, saveSession } from '../framework/session-manager';
import { upsertArtifact, getArtifacts, subscribeArtifacts } from '../framework/artifacts';
import { registerAzureDiagramIcons } from '../packs/azure/diagram-icons';

// Register packs and diagram icons
registerPackWithSkills(createAzurePack());
registerPackWithSkills(createGitHubPack());
registerAzureDiagramIcons();

// ─── Solution Architect Coworker ───
// An AI coworker that helps design and deploy cloud-native solutions.
// It gathers the full picture before creating resources, prefers
// scalable/resilient/secure architectures, and maintains a live
// architecture diagram in a side panel.

const ARCHITECT_SYSTEM_PROMPT = `You are a Solution Architect Coworker — a senior-level cloud architect with deep expertise in designing production-grade, scalable, secure, and cost-efficient cloud-native architectures.

═══ DISCOVERY PHASE ═══
Before proposing anything, conduct a thorough discovery. Ask about ALL of the following — do NOT guess or assume:

APPLICATION:
- What is the application? (web app, API, batch, real-time, etc.)
- What tech stack/framework? (language, runtime, containerized?)
- Where does it run today? (on-prem, another cloud, local dev?)
- What external dependencies exist? (third-party APIs, email services, payment gateways)

DATA:
- What databases/data stores are needed? (relational, document, key-value, blob/file)
- Expected data volume? Growth projections?
- Data residency or sovereignty requirements?
- Backup and disaster recovery RPO/RTO targets?

TRAFFIC & SCALE:
- Expected users/requests per second? Peak vs average?
- Geographic distribution of users?
- Any seasonal or bursty traffic patterns?
- Latency requirements? (p50, p99)

SECURITY & COMPLIANCE:
- Authentication method? (social login, enterprise SSO, API keys)
- Compliance frameworks? (SOC2, HIPAA, PCI-DSS, GDPR)
- Network isolation requirements? (private endpoints, VNet integration)
- Secret management needs?

OPERATIONS & DELIVERY:
- Team size and cloud maturity?
- CI/CD preferences? (GitHub Actions, Azure DevOps, Azure Pipelines, etc.)
- Existing Git workflow? (trunk-based, GitFlow, feature branches?)
- How do they deploy today? (manual, scripts, IaC, GitOps?)
- Environment strategy? (dev/staging/prod, per-PR environments?)
- Approval gates or change management requirements?
- Monitoring/observability requirements?
- Budget constraints or spend targets?

Ask these in logical groups over 2-3 turns — not all at once. Skip questions that were already answered.

═══ DESIGN PHASE ═══
When you have enough context, propose a production-ready architecture:

DESIGN PRINCIPLES:
- Production-ready from day one — no "we'll add that later" shortcuts
- Horizontally scalable: stateless compute, managed data services, CDN/caching
- Resilient: multi-AZ, health probes, auto-restart, circuit breakers
- Secure by default: private networking, managed identity, Key Vault for secrets, TLS everywhere
- Observable: centralized logging, metrics, alerts, distributed tracing
- Cost-conscious: right-size for current load, auto-scale for growth, use consumption tiers where appropriate
- Deployable via pipeline — every architecture MUST include a CI/CD pipeline or GitOps workflow. Infrastructure without automated deployment is incomplete.

For each service choice, explain WHY — reference the specific requirement it addresses. Present alternatives with tradeoffs when relevant.

═══ DEPLOYMENT PIPELINE & GITOPS ═══
A real architect always wires up the deployment path. ALWAYS propose a deployment pipeline alongside the architecture — never leave deployment as an exercise for the reader.

PREFER GITOPS when the workload runs on Kubernetes (AKS):
- Flux v2 or ArgoCD for continuous reconciliation from a Git repo
- Kustomize overlays or Helm values per environment (dev/staging/prod)
- Image automation: image update policies that auto-commit new tags
- Sealed Secrets or External Secrets Operator for secret management
- Include the GitOps repo structure in the deliverables

FOR ALL OTHER WORKLOADS, generate a CI/CD pipeline:
- GitHub Actions workflow (.github/workflows/deploy.yml) as the default
- If the user prefers Azure DevOps, generate azure-pipelines.yml instead
- Pipeline stages: lint → build → test → deploy-to-staging → approval-gate → deploy-to-prod
- Use OIDC/federated credentials for authentication (no stored secrets)
- Include environment-specific parameter files

DELIVERABLES — always generate these alongside IaC:
- Pipeline YAML file (GitHub Actions or Azure Pipelines) OR GitOps manifests (Flux/ArgoCD)
- Dockerfile if the app needs containerization
- Environment promotion strategy (how changes flow dev → staging → prod)
- Rollback procedure

Generate pipeline/GitOps files as codeBlock components just like Bicep files.

═══ INFRASTRUCTURE AS CODE ═══
After the architecture is approved, generate deployment artifacts as IaC files.

IMPORTANT: Generate Bicep files (.bicep) as codeBlock components with language "bicep" and a descriptive label.
The client auto-saves codeBlock components as downloadable files. Users can review, customize, and deploy them via CLI.

IaC STRUCTURE — generate these files:
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

═══ ARCHITECTURE DIAGRAM ═══
Include a "diagram" field when proposing or changing the architecture. Do NOT include it on login, region/subscription selection, confirmation, or deployment steps.

Diagram syntax:
- Start with "flowchart TD". Do NOT use "block-beta" or "block:".
- Group services with "subgraph id[\\"Label\\"] ... end"
- Arrows: A --> B. Chain: A --> B --> C. Branch: A --> B and A --> C on separate lines.
- Prefix labels with %%icon:ICON_NAME%% for icons.
- Value is a plain string with \\n for newlines. No backticks.

Working example:
"flowchart TD\\n  User([\\"User\\"])\\n  subgraph networking[\\"Networking\\"]\\n    DNS[\\"%%icon:azure/dns%%DNS\\"]\\n    FD[\\"%%icon:azure/front-door%%Front Door\\"]\\n  end\\n  subgraph compute[\\"Compute\\"]\\n    App[\\"%%icon:azure/app-service%%App Service\\"]\\n  end\\n  subgraph data[\\"Data\\"]\\n    SQL[\\"%%icon:azure/sql%%SQL\\"]\\n    Redis[\\"%%icon:azure/redis%%Redis\\"]\\n  end\\n  User --> DNS --> FD --> App\\n  App --> SQL\\n  App --> Redis"

Icons: azure/aks, azure/vm, azure/vmss, azure/container-instances, azure/acr, azure/sql, azure/cosmos-db, azure/postgresql, azure/mysql, azure/redis, azure/vnet, azure/load-balancer, azure/app-gateway, azure/front-door, azure/dns, azure/firewall, azure/nsg, azure/app-service, azure/function-app, azure/storage, azure/key-vault, azure/monitor, azure/log-analytics, azure/cognitive-services, azure/event-grid, azure/api-management, azure/subscription, azure/resource-group

═══ WORKFLOW ═══
1. DISCOVER — Understand the application, NFRs, constraints, and deployment preferences (2-3 turns of questions)
2. DESIGN — Propose architecture with reasoning, diagram, cost estimate, AND deployment strategy
3. ITERATE — Refine based on feedback
4. GENERATE — After approval, produce ALL deployment artifacts:
   a. Bicep IaC files for infrastructure
   b. CI/CD pipeline YAML or GitOps manifests
   c. Dockerfiles if containerized
   d. Environment config files
5. DEPLOY — Guide user through initial bootstrap (az login, pipeline setup, GitOps bootstrap)

Never skip discovery. Never hardcode infrastructure. Always generate reviewable IaC. Never deliver infrastructure without a deployment pipeline.`;

const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Solution Architect Coworker',
  agentMessage: "I'm your Solution Architect Coworker. I help design and deploy scalable, resilient, and secure cloud-native architectures.\n\nBefore jumping into resource creation, I'll work with you to understand your application, its requirements, and the right architecture. Tell me about your project — what are you building?",
  state: {},
  layout: {
    type: 'chatInput',
    placeholder: 'Describe your application or architecture needs...',
  },
  diagram: 'flowchart TD\n  User(["User"])\n  App["Your Application"]\n  Cloud["Cloud Provider"]\n  User --> App --> Cloud',
};

// ─── Mermaid extraction ───
// In Adaptive (full-spec) mode the LLM sometimes embeds the architecture
// diagram as a markdown text node instead of using the top-level `diagram`
// field. Walk the layout tree and extract the first Mermaid flowchart found.
const MERMAID_RE = /^(flowchart\s+(TD|TB|BT|LR|RL)\b)/;

function extractMermaidFromLayout(node: any): string | null {
  if (!node) return null;
  // Check markdown or text nodes
  if ((node.type === 'markdown' || node.type === 'md' || node.type === 'text' || node.type === 'tx') && typeof node.content === 'string') {
    if (MERMAID_RE.test(node.content.trim())) return node.content.trim();
  }
  // Also check the compact `c` key used before expansion
  if (typeof node.c === 'string' && MERMAID_RE.test(node.c.trim())) return node.c.trim();
  // Recurse children
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) {
    const found = extractMermaidFromLayout(child);
    if (found) return found;
  }
  // Recurse list items
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      const found = extractMermaidFromLayout(item);
      if (found) return found;
    }
  }
  // Recurse tabs
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) {
        for (const child of tab.children) {
          const found = extractMermaidFromLayout(child);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

// ─── Code block extraction ───
// Walk the layout tree and collect all codeBlock nodes so their content
// is auto-saved as artifacts (IaC files appear in the files panel automatically).
interface CodeBlock { code: string; language: string; label?: string; }

function extractCodeBlocksFromLayout(node: any): CodeBlock[] {
  if (!node) return [];
  const blocks: CodeBlock[] = [];
  // Check if this node is a codeBlock
  if ((node.type === 'codeBlock' || node.type === 'cb') && typeof node.code === 'string') {
    blocks.push({ code: node.code, language: node.language || '', label: node.label });
  }
  // Recurse children
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) {
    blocks.push(...extractCodeBlocksFromLayout(child));
  }
  // Recurse list items
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      blocks.push(...extractCodeBlocksFromLayout(item));
    }
  }
  // Recurse tabs
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) {
        for (const child of tab.children) {
          blocks.push(...extractCodeBlocksFromLayout(child));
        }
      }
    }
  }
  return blocks;
}

// Map language to file extension
const LANG_EXT: Record<string, string> = {
  bicep: 'bicep', json: 'json', yaml: 'yaml', yml: 'yaml',
  typescript: 'ts', javascript: 'js', python: 'py',
  bash: 'sh', shell: 'sh', dockerfile: 'Dockerfile',
  markdown: 'md', html: 'html', css: 'css', sql: 'sql',
  hcl: 'tf', terraform: 'tf', helm: 'yaml', xml: 'xml',
};

function codeBlockToFilename(block: CodeBlock): string {
  const ext = LANG_EXT[block.language] || block.language || 'txt';
  if (block.label) {
    // Use label as filename if it already looks like a filename
    if (block.label.includes('.')) return block.label;
    const base = block.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    return `${base}.${ext}`;
  }
  return `artifact.${ext}`;
}

export function SolutionArchitectApp() {
  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem('adaptive-ui-active-session') || generateSessionId();
    } catch { return generateSessionId(); }
  });

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const selectedArtifact = selectedFileId ? artifacts.find((a) => a.id === selectedFileId) || null : null;

  // Resizable panel widths
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(480);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(160, Math.min(400, w + delta)));
  }, []);
  const handleChatResize = useCallback((delta: number) => {
    setChatWidth((w) => Math.max(320, Math.min(700, w - delta)));
  }, []);

  const handleSpecChange = useCallback((spec: AdaptiveUISpec) => {
    // Auto-save/update architecture diagram as an artifact.
    const diagram = spec.diagram || extractMermaidFromLayout(spec.layout);
    if (diagram) {
      const art = upsertArtifact('architecture.mmd', diagram, 'mermaid', 'Solution Architecture');
      setSelectedFileId((prev) => prev || art.id);
    }

    // Auto-save code blocks (IaC files) as artifacts
    const codeBlocks = extractCodeBlocksFromLayout(spec.layout);
    for (const block of codeBlocks) {
      const filename = codeBlockToFilename(block);
      upsertArtifact(filename, block.code, block.language, block.label);
    }
    // If we got new code blocks and no file is selected, select the first one
    if (codeBlocks.length > 0 && !selectedFileId) {
      const firstFilename = codeBlockToFilename(codeBlocks[0]);
      const arts = getArtifacts();
      const match = arts.find((a) => a.filename === firstFilename);
      if (match) setSelectedFileId(match.id);
    }
  }, [selectedFileId]);

  const handleNewSession = useCallback(() => {
    // Save current session before creating a new one
    try {
      const raw = localStorage.getItem(`adaptive-ui-turns-${sessionId}`);
      if (raw) {
        const { turns } = JSON.parse(raw);
        if (turns && turns.length > 1) {
          const name = turns[turns.length - 1]?.agentSpec?.title || 'Session';
          saveSession(sessionId, name, turns);
        }
      }
    } catch {}

    const newId = generateSessionId();
    setSessionId(newId);
    try { localStorage.setItem('adaptive-ui-active-session', newId); } catch {}

    // Save the new session immediately so it shows in the sidebar
    saveSession(newId, 'New session', []);
    setSelectedFileId(null);

    // Seed the diagram artifact from the initial spec so the viewer has it
    if (initialSpec.diagram) {
      const art = upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Solution Architecture');
      setSelectedFileId(art.id);
    }
  }, [sessionId]);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
    try { localStorage.setItem('adaptive-ui-active-session', id); } catch {}
  }, []);

  // Auto-save session name from spec changes
  const handleSpecChangeWithSave = useCallback((spec: AdaptiveUISpec) => {
    handleSpecChange(spec);
    const name = spec.title || spec.agentMessage?.slice(0, 50) || 'Untitled session';
    try {
      const raw = localStorage.getItem(`adaptive-ui-turns-${sessionId}`);
      if (raw) {
        const { turns } = JSON.parse(raw);
        saveSession(sessionId, name, turns);
      }
    } catch {}
  }, [sessionId, handleSpecChange]);

  return React.createElement('div', {
    style: {
      display: 'flex',
      height: '100%',
      width: '100%',
    } as React.CSSProperties,
  },
    // Left: Sessions sidebar with files
    React.createElement('div', {
      style: { width: `${sidebarWidth}px`, flexShrink: 0, height: '100%' } as React.CSSProperties,
    },
      React.createElement(SessionsSidebar, {
        activeSessionId: sessionId,
        onSelectSession: handleSelectSession,
        onNewSession: handleNewSession,
        selectedFileId,
        onSelectFile: setSelectedFileId,
      })
    ),

    // Resize handle: sidebar ↔ center
    React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleSidebarResize }),

    // Center: File viewer / editor
    React.createElement('div', {
      style: {
        flex: 1,
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
      } as React.CSSProperties,
    },
      selectedArtifact
        ? React.createElement(FileViewer, { artifact: selectedArtifact })
        : React.createElement(FileViewerPlaceholder)
    ),

    // Resize handle: center ↔ chat
    React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleChatResize }),

    // Right: Chat
    React.createElement('div', {
      style: {
        width: `${chatWidth}px`,
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties,
    },
      React.createElement(AdaptiveApp, {
        key: sessionId,
        initialSpec,
        persistKey: sessionId,
        systemPromptSuffix: ARCHITECT_SYSTEM_PROMPT,
        theme: {
          primaryColor: '#2563eb',
          backgroundColor: '#f0f2f5',
          surfaceColor: '#ffffff',
        },
        onSpecChange: handleSpecChangeWithSave,
        onError: (error: Error) => console.error('Architect error:', error),
      })
    )
  );
}

// Self-register
registerApp({
  id: 'architect',
  name: 'Solution Architect Coworker',
  description: 'AI coworker for designing scalable, resilient cloud-native architectures',
  component: SolutionArchitectApp,
});
