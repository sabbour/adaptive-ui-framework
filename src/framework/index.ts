// ─── Adaptive UI Framework ───
// Public API exports

// Schema types
export type {
  AdaptiveValue,
  AdaptiveStyle,
  AdaptiveAction,
  AdaptiveValidation,
  AdaptiveNodeBase,
  TextNode,
  ButtonNode,
  InputNode,
  SelectNode,
  ImageNode,
  ContainerNode,
  CardNode,
  ListNode,
  TableNode,
  FormNode,
  TabsNode,
  ProgressNode,
  AlertNode,
  ChatInputNode,
  MarkdownNode,
  RadioGroupNode,
  MultiSelectNode,
  ToggleNode,
  SliderNode,
  DividerNode,
  BadgeNode,
  AccordionNode,
  CodeBlockNode,
  LinkNode,
  AdaptiveNode,
  AdaptiveUISpec,
  AdaptiveTheme,
  ConversationTurn,
} from './schema';

// Component registry & packs
export {
  registerComponent,
  unregisterComponent,
  registerComponents,
  registerPack,
  registerPackWithSkills,
  unregisterPack,
  resolvePackSkills,
  getPackSystemPrompts,
  getPackSettingsComponents,
  getComponent,
  hasComponent,
  getRegisteredTypes,
} from './registry';
export type { AdaptiveComponentProps, ComponentPack } from './registry';

// Renderer
export { AdaptiveRenderer, renderChildren } from './renderer';

// Context & state
export {
  AdaptiveProvider,
  useAdaptive,
  useAdaptiveState,
} from './context';
export type { StateAction, AdaptiveState } from './context';

// Interpolation
export { interpolate, resolveValue, interpolateDeep } from './interpolation';
export type { StateStore } from './interpolation';

// Compact notation
export { expandCompact } from './compact';

// Security
export { sanitizeSpec, sanitizeUrl, sanitizeInterpolation } from './sanitize';

// LLM adapters
export {
  OpenAIAdapter,
  MockAdapter,
  ADAPTIVE_UI_SYSTEM_PROMPT,
} from './llm-adapter';
export type { LLMAdapter, LLMMessage, OpenAIAdapterConfig } from './llm-adapter';

// App registry & router
export { registerApp, getApps, getApp } from './app-registry';
export type { AppEntry } from './app-registry';
export { AppRouter } from './app-router';

// Built-in components
export { registerBuiltinComponents } from './components/builtins';
export { ConversationThread } from './components/ConversationThread';

// Main app component
export { AdaptiveApp } from './AdaptiveApp';
export type { AdaptiveAppProps } from './AdaptiveApp';
