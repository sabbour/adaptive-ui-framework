import React, { useState, useCallback } from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createAzurePack } from '../packs/azure';
import { createGitHubPack } from '../packs/github';
import { ArchitectureDiagram } from '../framework/components/ArchitectureDiagram';
import { FilesPanel } from '../framework/components/FilesPanel';
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
  diagram: 'block-beta\n  columns 1\n  User(["User"]):1\n  space:1\n  App["Your Application"]:1\n  space:1\n  Cloud["Cloud Provider"]:1\n  User -- "requests" --> App\n  App -- "deploys to" --> Cloud',
};

export function SolutionArchitectApp() {
  const [diagram, setDiagram] = useState(() => {
    try {
      return sessionStorage.getItem('adaptive-ui-diagram') || initialSpec.diagram || '';
    } catch { return initialSpec.diagram || ''; }
  });

  const handleSpecChange = useCallback((spec: AdaptiveUISpec) => {
    if (spec.diagram) {
      setDiagram(spec.diagram);
      try { sessionStorage.setItem('adaptive-ui-diagram', spec.diagram); } catch {}
    }
  }, []);

  return React.createElement('div', {
    style: {
      display: 'flex',
      height: '100%',
      width: '100%',
    } as React.CSSProperties,
  },
    // Left panel: Architecture diagram + Files
    React.createElement('div', {
      style: {
        width: '55%',
        minWidth: '350px',
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties,
    },
      // Diagram (top)
      React.createElement('div', {
        style: { flex: 1, minHeight: 0, overflow: 'hidden' } as React.CSSProperties,
      },
        React.createElement(ArchitectureDiagram, {
          diagram,
          title: 'Solution Architecture',
        })
      ),
      // Files panel (bottom)
      React.createElement('div', {
        style: {
          height: '200px', flexShrink: 0,
          borderTop: '1px solid #333',
        } as React.CSSProperties,
      },
        React.createElement(FilesPanel)
      )
    ),

    // Right panel: Chat
    React.createElement('div', {
      style: {
        flex: 1,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties,
    },
      React.createElement(AdaptiveApp, {
        initialSpec,
        persistKey: 'architect',
        systemPromptOverride: ARCHITECT_SYSTEM_PROMPT,
        theme: {
          primaryColor: '#2563eb',
          backgroundColor: '#f0f2f5',
          surfaceColor: '#ffffff',
        },
        onSpecChange: handleSpecChange,
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
