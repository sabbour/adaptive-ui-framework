// ─── Diagram Renderer Registry ───
// Allows apps to register a custom diagram renderer (e.g. mermaid-based)
// without the core framework depending on mermaid directly.

import type React from 'react';

/** Props passed to a registered diagram renderer component */
export interface DiagramRendererProps {
  /** Diagram definition string (e.g. Mermaid flowchart) */
  diagram: string;
  /** Optional title shown above the diagram */
  title?: string;
}

/** Icon registration for diagram rendering */
const iconRegistry = new Map<string, string>();

/** Register icon URLs for use in architecture diagrams. Called by packs at init time. */
export function registerDiagramIcons(icons: Record<string, string>) {
  for (const [name, url] of Object.entries(icons)) {
    iconRegistry.set(name.toLowerCase(), url);
  }
}

/** Look up a registered icon URL by logical name */
export function getDiagramIconUrl(name: string): string | undefined {
  return iconRegistry.get(name.toLowerCase());
}

/** Get all registered icon names (for LLM prompt context) */
export function getRegisteredIconNames(): string[] {
  return Array.from(iconRegistry.keys());
}

/** Get the full icon registry map (for diagram renderers) */
export function getDiagramIconRegistry(): ReadonlyMap<string, string> {
  return iconRegistry;
}

// ─── Pluggable renderer ───

let registeredRenderer: React.ComponentType<DiagramRendererProps> | null = null;

/** Register a diagram renderer component (e.g. a mermaid-based ArchitectureDiagram). */
export function registerDiagramRenderer(component: React.ComponentType<DiagramRendererProps>) {
  registeredRenderer = component;
}

/** Get the currently registered diagram renderer, or null if none. */
export function getDiagramRenderer(): React.ComponentType<DiagramRendererProps> | null {
  return registeredRenderer;
}
