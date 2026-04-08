/// <reference path="./vite-env.d.ts" />

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
  ColumnsNode,
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
  clearAllPacks,
  getActivePackScope,
  setActivePackScope,
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
export type { LLMAdapter, LLMMessage, OpenAIAdapterConfig, ModelRouter, ModelTaskType } from './llm-adapter';

// Entra ID authentication for Azure AI Foundry
export { entraLogin, entraLogout, entraGetActiveAccount, entraGetAccessToken } from './entra-auth';
export type { EntraAuthResult } from './entra-auth';

// Tool system
export { registerTool, getToolDefinitions } from './tools';
export type { ToolDefinition, ToolCall, ToolResult } from './tools';

// Artifacts
export { saveArtifact, upsertArtifact, removeArtifact, clearArtifacts, getArtifacts, subscribeArtifacts, downloadArtifact, loadArtifactsForSession, saveArtifactsForSession, deleteArtifactsForSession, setArtifactsScope } from './artifacts';
export type { Artifact } from './artifacts';

// Session management
export { getSessions, subscribeSessions, saveSession, loadSession, deleteSession, renameSession, generateSessionId, setSessionScope } from './session-manager';
export type { Session } from './session-manager';

// App registry & router
export { registerApp, getApps, getApp } from './app-registry';
export type { AppEntry } from './app-registry';
export { AppRouter } from './app-router';

// Built-in components
export { registerBuiltinComponents } from './components/builtins';
export { ConversationThread } from './components/ConversationThread';
export { SessionsSidebar } from './components/SessionsSidebar';
export { FileViewer, FileViewerPlaceholder } from './components/FileViewer';
export { ResizeHandle } from './components/ResizeHandle';

// Main app component
export { AdaptiveApp } from './AdaptiveApp';
export type { AdaptiveAppProps } from './AdaptiveApp';

// Request tracker
export { trackedFetch } from './request-tracker';

// Re-exported component utilities (used by packs)
export { SearchableDropdown } from './components/builtins';
export { createPullRequest, updatePullRequestBranch } from './components/FilesPanel';
export { registerDiagramIcons, registerDiagramRenderer, getDiagramRenderer, getDiagramIconUrl, getRegisteredIconNames, getDiagramIconRegistry } from './diagram-registry';
export type { DiagramRendererProps } from './diagram-registry';
