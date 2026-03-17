// ─── Intent Schema ───
// A smaller, semantic vocabulary the LLM outputs instead of full AdaptiveUISpec.
// The client resolves intents to concrete AdaptiveNode trees via intent-resolver.ts.
//
// This reduces the system prompt from ~1,200 tokens (24 component types + props)
// to ~400 tokens (7 ask types + 5 show types), and shrinks LLM output by ~60%.

import type { AdaptiveValue, AdaptiveTheme, AdaptiveNode } from './schema';

// ─── Ask intents: collect user input ───

export interface ChoiceOption {
  label: string;
  value: string;
  description?: string;
}

export interface ChoiceAsk {
  type: 'choice';
  key: string;
  label?: string;
  options: ChoiceOption[];
  /** Multi-select mode */
  multiple?: boolean;
}

export interface TextAsk {
  type: 'text' | 'number' | 'email' | 'date' | 'textarea';
  key: string;
  label?: string;
  placeholder?: string;
}

export interface ToggleAsk {
  type: 'toggle';
  key: string;
  label?: string;
  description?: string;
}

export interface SliderAsk {
  type: 'slider';
  key: string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface FreeTextAsk {
  type: 'free-text';
  placeholder?: string;
}

/** Escape hatch for pack-specific components (azureLogin, azureResourceForm, etc.) */
export interface ComponentAsk {
  type: 'component';
  component: string;
  props?: Record<string, unknown>;
}

/** Dynamic options fetched from an API at render time (e.g., Azure regions, resource groups) */
export interface DynamicAsk {
  type: 'azure-regions' | 'azure-resource-groups' | 'azure-skus' | 'azure-subscriptions';
  key: string;
  label?: string;
  /** For azure-skus: the resource provider type (e.g., "Microsoft.Compute/virtualMachines") */
  resourceType?: string;
}

export type AskIntent =
  | ChoiceAsk
  | TextAsk
  | ToggleAsk
  | SliderAsk
  | FreeTextAsk
  | ComponentAsk
  | DynamicAsk;

// ─── Show intents: display information ───

export interface AlertShow {
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  content: string;
}

export interface MarkdownShow {
  type: 'markdown';
  content: string;
}

export interface TableShow {
  type: 'table';
  columns: Array<{ key: string; header: string; width?: string }>;
  rows: Array<Record<string, unknown>>;
}

export interface ProgressShow {
  type: 'progress';
  value: number;
  max?: number;
  label?: string;
}

export interface CodeShow {
  type: 'code';
  code: string;
  language?: string;
}

export type ShowIntent =
  | AlertShow
  | MarkdownShow
  | TableShow
  | ProgressShow
  | CodeShow;

// ─── Top-level agent response ───

export interface AgentIntent {
  /** Natural language message explaining this step */
  message: string;

  /** Step title */
  title?: string;

  /** Fields to collect from the user */
  ask?: AskIntent[];

  /** Information to display */
  show?: ShowIntent[];

  /** sendPrompt template for the Continue button (supports {{state.key}}) */
  next?: string;

  /** Initial state values for this step */
  state?: Record<string, AdaptiveValue>;

  /** Theme overrides */
  theme?: AdaptiveTheme;

  /** Mermaid diagram */
  diagram?: string;

  /** Escape hatch: raw AdaptiveNode layout (bypasses intent resolution) */
  layout?: AdaptiveNode;
}
