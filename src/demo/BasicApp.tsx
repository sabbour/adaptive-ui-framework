import React, { useState, useCallback } from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createAzurePack } from '../packs/azure';
import { createGitHubPack } from '../packs/github';
import { ArchitectureDiagram } from '../framework/components/ArchitectureDiagram';
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
Include a "diagram" field in EVERY response with a Mermaid block-beta diagram.
- Use "block-beta" with "columns 1" for vertical layout.
- Group services by architectural tier (networking, compute, data, observability) — each tier is a separate block group.
- Place only closely-related services in the same group. DNS and App Service belong in different tiers.
- Define all blocks first, then arrows (-->) between block IDs.
- Prefix labels with %%icon:ICON_NAME%% for icons (e.g. "%%icon:azure/aks%%AKS Cluster").
- Diagram value is a plain string with \\n for newlines. Quote labels with special chars.

Example: "block-beta\\n  columns 1\\n  User[\\"User\\"]\\n  block:networking[\\"Networking\\"]\\n    DNS[\\"%%icon:azure/dns%%DNS\\"]\\n  end\\n  block:compute[\\"Compute\\"]\\n    AppSvc[\\"%%icon:azure/app-service%%App Service\\"]\\n  end\\n  block:observability[\\"Observability\\"]\\n    Monitor[\\"%%icon:azure/monitor%%Azure Monitor\\"]\\n  end\\n  User --> DNS\\n  DNS --> AppSvc\\n  AppSvc --> Monitor"

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
    // Left panel: Architecture diagram
    React.createElement('div', {
      style: {
        width: '60%',
        minWidth: '400px',
        height: '100%',
        flexShrink: 0,
      } as React.CSSProperties,
    },
      React.createElement(ArchitectureDiagram, {
        diagram,
        title: 'Solution Architecture',
      })
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
