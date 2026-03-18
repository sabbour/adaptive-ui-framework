import React, { useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { AdaptiveApp, registerApp, registerPackWithSkills, clearAllPacks, getActivePackScope, setActivePackScope, SessionsSidebar, FileViewer, FileViewerPlaceholder, ResizeHandle, generateSessionId, saveSession, deleteSession, setSessionScope, upsertArtifact, getArtifacts, subscribeArtifacts, loadArtifactsForSession, saveArtifactsForSession, deleteArtifactsForSession, setArtifactsScope } from '@sabbour/adaptive-ui-core';
import type { AdaptiveUISpec } from '@sabbour/adaptive-ui-core';
import { createAzurePack } from '@sabbour/adaptive-ui-azure-pack';
import { createGitHubPack } from '@sabbour/adaptive-ui-github-pack';
import { registerAzureDiagramIcons } from '@sabbour/adaptive-ui-azure-pack/diagram-icons';

// Lazy pack registration — called when this app mounts, clears other app's packs
function ensureArchitectPacks() {
  if (getActivePackScope() === 'architect') return;
  clearAllPacks();
  registerPackWithSkills(createAzurePack());
  registerPackWithSkills(createGitHubPack());
  registerAzureDiagramIcons();
  setActivePackScope('architect');
}

// ─── Solution Architect Coworker ───
// An AI coworker that helps design and deploy cloud-native solutions.
// It gathers the full picture before creating resources, prefers
// scalable/resilient/secure architectures, and maintains a live
// architecture diagram in a side panel.

const ARCHITECT_SYSTEM_PROMPT = `You are a Solution Architect Coworker — senior cloud architect designing production-grade, scalable, secure, cost-efficient cloud-native architectures.

═══ DISCOVERY ═══
Before proposing anything, ask about ALL of these (2-3 turns, logical groups, skip already-answered):

APP: type (web/API/batch/realtime), tech stack, current hosting, external dependencies
DATA: databases needed, volume/growth, residency, backup RPO/RTO
SCALE: users/RPS (peak vs avg), geo distribution, bursty patterns, latency targets
SECURITY: auth method, compliance (SOC2/HIPAA/PCI/GDPR), network isolation, secrets
OPERATIONS: team size/maturity, CI/CD preference, Git workflow, deploy method, env strategy, approval gates, monitoring, budget

If the user points you to an existing repo or codebase, use the github_api_get tool or fetch_webpage to inspect it:
- Read the repo structure, package files, Dockerfiles, CI configs to understand the stack
- Check existing IaC, deployment scripts, or Helm charts
- Use this information to skip redundant discovery questions and tailor your recommendations

═══ DESIGN ═══
Propose production-ready architecture when you have enough context.

Principles: production-ready day one; horizontally scalable (stateless compute, managed data, CDN); resilient (multi-zone, health probes, circuit breakers); secure by default (private networking, workload identity, vault, TLS); observable (centralized logs, metrics, alerts, tracing); cost-conscious (right-sized, auto-scale, consumption tiers).

Every architecture MUST include deployment pipeline. Explain WHY per service choice.

APPROACH:
- Right-size for TODAY but design for GROWTH. Don't over-engineer for a hobby project, but don't paint into a corner either.
- When multiple valid approaches exist, present 2-3 options as a comparison (table with pros/cons/cost) and let the user choose.
- Include estimated monthly cost breakdown by service tier. Call out which tiers can scale up later.
- If the user asks for something that's an anti-pattern, push back with reasoning — don't just comply.
- For existing systems: assess migration strategy (lift-and-shift vs re-platform vs re-architect) and propose a phased approach.
- After generating code, proactively call out security considerations (exposed endpoints, secrets that need rotation, compliance gaps).

═══ DEPLOYMENT ═══
Always include a deployment strategy alongside the architecture. Choose the approach that fits the workload. The active cloud pack provides specific tooling guidance.
Always generate: deployment pipeline config, container build files if needed, env promotion strategy, rollback procedure.

═══ IaC & CODE ═══
Generate as codeBlock components. label = filename (e.g., "main.bicep", "app.py"). Unique labels — duplicates overwrite. Auto-saved as downloadable files.

Use the IaC tool and language that fits the user's cloud provider and preferences (the active cloud pack provides guidance). Follow user preference.

Best practices: parameterize values with defaults, modularize by concern, tag resources, workload identity over connection strings, diagnostic settings, vault for secrets, output endpoints/IDs, include deploy script.

Do NOT call cloud APIs to create resources — generate IaC only. Read-only queries are OK.

The workflow is flexible — users may also ask to:
- Generate application code alongside or instead of IaC
- Scaffold a new project from scratch
- Create deployment manifests or configs
- Review and improve existing code from their repo
Treat all code generation the same: use codeBlock components with filename labels.

CRITICAL — DESIGN-TO-CODE COHERENCE:
Before generating IaC, review the architecture you proposed and the diagram you generated. The IaC MUST match exactly:
- Every service in the diagram MUST have a corresponding resource in the IaC. If the diagram shows 3 services, the IaC must provision all 3.
- Resource types must match the design exactly. Do NOT substitute a different service than what was proposed (e.g., don't swap a container platform for a PaaS app service, or swap one database engine for another).
- Connections shown in the diagram (arrows between services) must be reflected in IaC via networking rules, connection strings, role assignments, or environment variables.
- If the design included monitoring, secrets, or networking components, generate IaC for those too — not just the compute and data tiers.
- When generating multiple modules, list the services each module covers so the user can verify completeness.

═══ DIAGRAM ═══
Include "diagram" when proposing/changing architecture. Omit on login/selection/confirmation steps.
Syntax: "flowchart TD", subgraph id["Label"]...end, A-->B, %%icon:NAME%% prefix for icons. Plain string with \\n, no backticks. Never use "block-beta".

═══ WORKFLOW ═══
1. DISCOVER — app, NFRs, constraints, deploy prefs (2-3 turns). Inspect existing repos if provided.
2. DESIGN — architecture + reasoning + diagram + cost + deploy strategy
3. ITERATE — refine on feedback
4. GENERATE — IaC, deployment configs, application code as needed
5. COMMIT — ask to create PR to GitHub repo
6. DEPLOY — guide bootstrap

CONFIRMATION/REVIEW steps: When summarizing what you've learned so far, write a short readable paragraph (2-4 sentences) that naturally weaves in the collected details — do NOT use a table or key-value list. Example: "You're building a Go batch agent that scrapes the web 4x daily, stores ~10 articles per run in a database with 7-day retention, and serves results on a dashboard for up to 100 users with OAuth." Then show input fields for any gaps.

Never skip discovery. Never hardcode infra. Always generate reviewable code with deployment strategy.`;

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

const seenFilenames = new Set<string>();

function codeBlockToFilename(block: CodeBlock): string {
  const ext = LANG_EXT[block.language] || block.language || 'txt';
  let filename: string;

  if (block.label) {
    // If label already looks like a filename (has extension), use it directly
    if (block.label.includes('.')) {
      filename = block.label;
    } else {
      const base = block.label.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/-+$/, '');
      filename = `${base}.${ext}`;
    }
  } else {
    filename = `artifact.${ext}`;
  }

  // Deduplicate filenames within the same spec
  if (seenFilenames.has(filename)) {
    let counter = 2;
    const dotIdx = filename.lastIndexOf('.');
    const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
    const extension = dotIdx >= 0 ? filename.slice(dotIdx) : '';
    while (seenFilenames.has(`${base}-${counter}${extension}`)) counter++;
    filename = `${base}-${counter}${extension}`;
  }
  seenFilenames.add(filename);
  return filename;
}

export function SolutionArchitectApp() {
  // Scope sessions, artifacts, and packs to this app
  setSessionScope('architect');
  setArtifactsScope('architect');
  ensureArchitectPacks();

  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem('adaptive-ui-active-session') || generateSessionId();
    } catch { return generateSessionId(); }
  });

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const selectedArtifact = selectedFileId ? artifacts.find((a) => a.id === selectedFileId) || null : null;
  const sendPromptRef = useRef<((prompt: string) => void) | null>(null);

  // Load artifacts for the initial session on mount
  const initialLoadRef = useRef(false);
  if (!initialLoadRef.current) {
    initialLoadRef.current = true;
    loadArtifactsForSession(sessionId);
  }

  const handleCreatePR = useCallback(() => {
    if (sendPromptRef.current) {
      sendPromptRef.current('Create a pull request with the generated files');
    }
  }, []);

  // Resizable panel widths
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    seenFilenames.clear();
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
    saveArtifactsForSession(sessionId);
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

    // Load artifacts for the new session (starts empty)
    loadArtifactsForSession(newId);

    // Seed the diagram artifact from the initial spec so the viewer has it
    if (initialSpec.diagram) {
      const art = upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Solution Architecture');
      setSelectedFileId(art.id);
    }
  }, [sessionId]);

  const handleSelectSession = useCallback((id: string) => {
    // Save current session's artifacts, load the new session's
    saveArtifactsForSession(sessionId);
    setSessionId(id);
    setSelectedFileId(null);
    loadArtifactsForSession(id);
    try { localStorage.setItem('adaptive-ui-active-session', id); } catch {}
  }, [sessionId]);

  const handleDeleteSession = useCallback((id: string) => {
    // Delete session data and its artifacts
    deleteSession(id);
    deleteArtifactsForSession(id);
    // If deleting the active session, create a new one
    if (id === sessionId) {
      const newId = generateSessionId();
      setSessionId(newId);
      setSelectedFileId(null);
      saveSession(newId, 'New session', []);
      loadArtifactsForSession(newId);
      try { localStorage.setItem('adaptive-ui-active-session', newId); } catch {}
      if (initialSpec.diagram) {
        const art = upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Solution Architecture');
        setSelectedFileId(art.id);
      }
    }
  }, [sessionId]);

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
      overflow: 'hidden',
    } as React.CSSProperties,
  },
    // Left: Sessions sidebar with files
    React.createElement('div', {
      style: {
        width: sidebarCollapsed ? '36px' : `${sidebarWidth}px`,
        flexShrink: 0, height: '100%', overflow: 'hidden',
        transition: 'width 0.15s ease',
      } as React.CSSProperties,
    },
      React.createElement(SessionsSidebar, {
        activeSessionId: sessionId,
        onSelectSession: handleSelectSession,
        onNewSession: handleNewSession,
        onDeleteSession: handleDeleteSession,
        selectedFileId,
        onSelectFile: setSelectedFileId,
        onCreatePR: handleCreatePR,
        collapsed: sidebarCollapsed,
        onToggleCollapse: setSidebarCollapsed,
      })
    ),

    // Resize handle: sidebar ↔ center (hidden when collapsed)
    !sidebarCollapsed && React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleSidebarResize }),

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
        sendPromptRef,
        visiblePacks: ['azure', 'github'],
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
