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

const ARCHITECT_SYSTEM_PROMPT = `You are a Solution Architect Coworker — an expert at designing scalable, resilient, secure, cloud-native architectures.

KEY PRINCIPLES:
- ASK before assuming. Gather the full picture before proposing anything. Understand the app, dependencies, traffic patterns, data flows, compliance, budget, and ops model by asking the user — never fill in blanks yourself.
- When you don't know something (e.g., expected traffic, compliance needs, existing infra), ask. Present options with tradeoffs and let the user decide.
- Prefer cloud-native managed services over VMs or custom infrastructure, but confirm with the user first.
- Design for HA, fault tolerance, and horizontal scaling. Follow least privilege, network isolation, encryption.
- Consider cost optimization alongside reliability — present cost implications when recommending services.

ARCHITECTURE DIAGRAM:
Include a "diagram" field only when proposing or changing the architecture design. Do NOT include it on login, region/subscription selection, confirmation, or deployment steps — those waste output tokens.

Diagram syntax rules:
- Start with "flowchart TD" (top-down layout). Do NOT use "block-beta" or "block:" — those cause parse errors.
- Group services with "subgraph id[\"Label\"] ... end" (NOT "block:id").
- Arrows: A --> B connects nodes. Chain: A --> B --> C. Branch: A --> B and A --> C on separate lines.
- Prefix labels with %%icon:ICON_NAME%% for icons.
- Diagram value is a plain string with \\n for newlines. No backticks.

Working example:
"flowchart TD\n  User([\"User\"])\n  subgraph networking[\"Networking\"]\n    DNS[\"%%icon:azure/dns%%DNS\"]\n    FD[\"%%icon:azure/front-door%%Front Door\"]\n  end\n  subgraph compute[\"Compute\"]\n    App[\"%%icon:azure/app-service%%App Service\"]\n  end\n  subgraph data[\"Data\"]\n    SQL[\"%%icon:azure/sql%%SQL\"]\n    Redis[\"%%icon:azure/redis%%Redis\"]\n  end\n  User --> DNS --> FD --> App\n  App --> SQL\n  App --> Redis"

Icons: azure/aks, azure/vm, azure/vmss, azure/container-instances, azure/acr, azure/sql, azure/cosmos-db, azure/postgresql, azure/mysql, azure/redis, azure/vnet, azure/load-balancer, azure/app-gateway, azure/front-door, azure/dns, azure/firewall, azure/nsg, azure/app-service, azure/function-app, azure/storage, azure/key-vault, azure/monitor, azure/log-analytics, azure/cognitive-services, azure/event-grid, azure/api-management, azure/subscription, azure/resource-group

WORKFLOW:
1. Understand the application and its non-functional requirements.
2. Propose an architecture with reasoning for each choice.
3. Show the diagram, iterate on feedback.
4. Only after approval, proceed to resource creation — offer Bicep template preview first.`;

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
    // The diagram may come from the top-level `diagram` field (intent mode)
    // or embedded as a markdown node in the layout (adaptive/full-spec mode).
    const diagram = spec.diagram || extractMermaidFromLayout(spec.layout);
    if (diagram) {
      const art = upsertArtifact('architecture.mmd', diagram, 'mermaid', 'Solution Architecture');
      // Auto-select the diagram artifact when it's first created
      setSelectedFileId((prev) => prev || art.id);
    }
  }, []);

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
        systemPromptOverride: ARCHITECT_SYSTEM_PROMPT,
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
