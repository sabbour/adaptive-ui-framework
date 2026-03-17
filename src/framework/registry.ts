import React from 'react';
import type { AdaptiveNode, AdaptiveNodeBase } from './schema';
import { registerTool } from './tools';

// ─── Component Registry ───
// Maps schema `type` strings to React components.
// Framework users register custom components here.

export type AdaptiveComponentProps<T extends AdaptiveNodeBase = AdaptiveNodeBase> = {
  node: T;
  children?: React.ReactNode;
};

type ComponentFactory = React.ComponentType<AdaptiveComponentProps<any>>;

const registry = new Map<string, ComponentFactory>();
const packPrompts = new Map<string, string>();
const packSkillPrompts = new Map<string, string>();
const packSettings = new Map<string, { displayName: string; component: React.ComponentType }>();

// ─── Intent Resolver Registry ───
// Packs can register custom intent resolvers that map ask types to AdaptiveNode trees.

export interface IntentResolverEntry {
  /** Description shown to the LLM (e.g., "Pick an Azure region from live API data") */
  description: string;
  /** Props the LLM can pass (e.g., "key, label?") */
  props: string;
  /** Resolve function: maps the ask object to an AdaptiveNode */
  resolve: (ask: Record<string, unknown>) => AdaptiveNode;
}

const intentResolvers = new Map<string, IntentResolverEntry>();

/** Register a custom intent resolver. Packs use this to add domain-specific ask types. */
export function registerIntentResolver(type: string, entry: IntentResolverEntry): void {
  intentResolvers.set(type, entry);
}

/** Look up a registered intent resolver */
export function getIntentResolver(type: string): IntentResolverEntry | undefined {
  return intentResolvers.get(type);
}

/** Get all registered intent types as a prompt fragment for the LLM */
export function getIntentResolverPrompt(): string {
  if (intentResolvers.size === 0) return '';
  const lines = Array.from(intentResolvers.entries()).map(
    ([type, entry]) => `- { type: "${type}", ${entry.props} } — ${entry.description}`
  );
  return '\nDynamic ask types (fetched from live APIs, use instead of hardcoding options):\n' + lines.join('\n');
}

// ─── Component Pack ───
// A bundle of components + LLM context + optional knowledge skills + optional intent resolvers.

export interface ComponentPack {
  name: string;
  displayName?: string;
  components: Record<string, ComponentFactory>;
  systemPrompt: string;

  /** Optional async initialization (e.g., fetch API metadata). */
  initialize?: () => Promise<Record<string, ComponentFactory>>;

  /** Optional knowledge skills — fetched on demand when relevant topics
   *  are detected in the conversation. Returns additional system prompt context. */
  resolveSkills?: (prompt: string) => Promise<string | null>;

  /** Optional settings UI component injected into the settings panel. */
  settingsComponent?: React.ComponentType;

  /** Optional intent resolvers — custom ask types the LLM can use in intent mode.
   *  Auto-documented in the system prompt so the LLM knows they exist. */
  intentResolvers?: Record<string, IntentResolverEntry>;

  /** Optional tools — functions the LLM can call during inference (e.g., read-only API queries).
   *  Registered via registerTool() so the LLM can invoke them before producing the UI response. */
  tools?: Array<{ definition: import('./tools').ToolDefinition; handler: (args: Record<string, unknown>) => Promise<string> }>;
}

/** Register a component pack */
export async function registerPack(pack: ComponentPack): Promise<void> {
  for (const [type, component] of Object.entries(pack.components)) {
    registry.set(type, component);
  }
  packPrompts.set(pack.name, pack.systemPrompt);
  if (pack.settingsComponent) {
    packSettings.set(pack.name, {
      displayName: pack.displayName ?? pack.name,
      component: pack.settingsComponent,
    });
  }
  if (pack.initialize) {
    const dynamic = await pack.initialize();
    for (const [type, component] of Object.entries(dynamic)) {
      registry.set(type, component);
    }
  }
  if (pack.intentResolvers) {
    for (const [type, entry] of Object.entries(pack.intentResolvers)) {
      registerIntentResolver(type, entry);
    }
  }
  if (pack.tools) {
    for (const tool of pack.tools) {
      registerTool(tool.definition, tool.handler);
    }
  }
}

/** Unregister a pack */
export function unregisterPack(pack: ComponentPack): void {
  for (const type of Object.keys(pack.components)) {
    registry.delete(type);
  }
  packPrompts.delete(pack.name);
  packSkillPrompts.delete(pack.name);
  packSettings.delete(pack.name);
  if (pack.intentResolvers) {
    for (const type of Object.keys(pack.intentResolvers)) {
      intentResolvers.delete(type);
    }
  }
}

/** Resolve knowledge skills from all registered packs for a given prompt.
 *  Returns the newly resolved skills text (only fresh content for this turn). */
export async function resolvePackSkills(prompt: string): Promise<string | null> {
  const packs = Array.from(packPrompts.keys());
  const newSkills: string[] = [];
  for (const packName of packs) {
    const resolver = packResolvers.get(packName);
    if (resolver) {
      const skills = await resolver(prompt);
      if (skills) {
        // Only treat as "new" if the content changed from what we had before
        const previous = packSkillPrompts.get(packName);
        if (skills !== previous) {
          newSkills.push(skills);
        }
        packSkillPrompts.set(packName, skills);
      }
    }
  }
  return newSkills.length > 0 ? newSkills.join('\n\n') : null;
}

// Store resolvers separately so we can call them later
const packResolvers = new Map<string, (prompt: string) => Promise<string | null>>();

// Override registerPack to also store resolver
const _originalRegisterPack = registerPack;
export async function registerPackWithSkills(pack: ComponentPack): Promise<void> {
  await _originalRegisterPack(pack);
  if (pack.resolveSkills) {
    packResolvers.set(pack.name, pack.resolveSkills);
  }
}

/** Get combined system prompt from all registered packs (base prompts only, not skills) */
export function getPackSystemPrompts(): string {
  const base = Array.from(packPrompts.values());
  return base.filter(Boolean).join('\n\n');
}

/** Get all registered pack settings components */
export function getPackSettingsComponents(): Array<{ name: string; displayName: string; component: React.ComponentType }> {
  return Array.from(packSettings.entries()).map(([name, { displayName, component }]) => ({
    name, displayName, component,
  }));
}

/** Register a component for a schema type */
export function registerComponent(type: string, component: ComponentFactory): void {
  registry.set(type, component);
}

/** Unregister a component */
export function unregisterComponent(type: string): void {
  registry.delete(type);
}

/** Get a registered component, or undefined */
export function getComponent(type: string): ComponentFactory | undefined {
  return registry.get(type);
}

/** Check if a type is registered */
export function hasComponent(type: string): boolean {
  return registry.has(type);
}

/** Get all registered type names */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}

/** Register multiple components at once */
export function registerComponents(components: Record<string, ComponentFactory>): void {
  for (const [type, component] of Object.entries(components)) {
    registry.set(type, component);
  }
}
