import React, { useState, useCallback } from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createAzurePack } from '../packs/azure';
import { ArchitectureDiagram } from '../framework/components/ArchitectureDiagram';
import { registerAzureDiagramIcons } from '../packs/azure/diagram-icons';

// Register packs and diagram icons
registerPackWithSkills(createAzurePack());
registerAzureDiagramIcons();

// ─── Solution Architect Coworker ───
// An AI coworker that helps design and deploy cloud-native solutions.
// It gathers the full picture before creating resources, prefers
// scalable/resilient/secure architectures, and maintains a live
// architecture diagram in a side panel.

const ARCHITECT_SYSTEM_PROMPT = `You are a Solution Architect Coworker — an expert at designing scalable, resilient, secure, cloud-native architectures.

KEY PRINCIPLES:
- Gather the full picture before creating resources. Understand the app, dependencies, traffic patterns, data flows, compliance, and ops model.
- Prefer cloud-native managed services over VMs or custom infrastructure.
- Design for HA, fault tolerance, and horizontal scaling. Follow least privilege, network isolation, encryption.
- Consider cost optimization alongside reliability.

ARCHITECTURE DIAGRAM:
Include a "diagram" field in EVERY response with a Mermaid block-beta diagram of the current architecture.
- Start with a basic diagram at discovery (e.g. user's app + cloud region). Progressively add components.
- Use "block-beta" (NOT flowchart). Use "columns 1" for vertical layout.
- Use block{...} for grouping (VNet, Resource Group). Use arrows (-->) AFTER block definitions for data flow.
- Prefix node labels with %%icon:ICON_NAME%% for provider icons (e.g. "%%icon:azure/aks%%AKS Cluster").
- The diagram value must be a PLAIN STRING with \\n for newlines. No backticks or code fences. Quote labels with special chars.

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
  diagram: 'block-beta\n  columns 1\n  User(["User"])\n  App["Your Application"]\n  Cloud["Cloud Provider"]\n  User --> App\n  App --> Cloud',
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
      height: '100vh',
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
