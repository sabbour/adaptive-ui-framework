// ── Adaptive UI Schema ──
// This is the JSON schema that LLMs produce to describe UI.
// The framework renders components from this schema dynamically.

// ─── Primitive value types ───
export type AdaptiveValue = string | number | boolean | null;

// ─── Style (subset of CSS that's safe to expose) ───
export interface AdaptiveStyle {
  // Layout
  display?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gap?: string;
  flex?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;

  // Spacing
  padding?: string;
  margin?: string;

  // Sizing
  width?: string;
  height?: string;
  maxWidth?: string;
  minWidth?: string;
  maxHeight?: string;
  minHeight?: string;

  // Typography
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  textAlign?: string;
  color?: string;

  // Background & Border
  background?: string;
  backgroundColor?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;

  // Other
  overflow?: string;
  cursor?: string;
  opacity?: string;
  position?: string;
  textDecoration?: string;

  [key: string]: string | undefined;
}

// ─── Actions that components can trigger ───
export interface AdaptiveAction {
  /** The type of action */
  type: 'sendPrompt' | 'setState' | 'navigate' | 'submit' | 'custom';

  /** For sendPrompt: the prompt text (can include {{state.key}} interpolation) */
  prompt?: string;

  /** For setState: key-value pairs to merge into state */
  state?: Record<string, AdaptiveValue>;

  /** For navigate: the target URL or route */
  target?: string;

  /** For custom: a named action that the host app handles */
  name?: string;

  /** Arbitrary payload */
  payload?: Record<string, unknown>;
}

// ─── Validation rules for form inputs ───
export interface AdaptiveValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  message?: string;
}

// ─── Base node — every UI element extends this ───
export interface AdaptiveNodeBase {
  /** Component type — maps to a registered renderer */
  type: string;

  /** Unique key for React reconciliation */
  id?: string;

  /** Inline styles */
  style?: AdaptiveStyle;

  /** CSS class names */
  className?: string;

  /** Whether this node is visible. Supports state interpolation "{{state.key}}" */
  visible?: boolean | string;

  /** Arbitrary props forwarded to the component */
  props?: Record<string, unknown>;
}

// ─── Concrete node types ───

export interface TextNode extends AdaptiveNodeBase {
  type: 'text';
  content: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'code';
}

export interface ButtonNode extends AdaptiveNodeBase {
  type: 'button';
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean | string;
  onClick: AdaptiveAction;
}

export interface InputNode extends AdaptiveNodeBase {
  type: 'input';
  inputType?: 'text' | 'number' | 'email' | 'password' | 'textarea' | 'date';
  label?: string;
  placeholder?: string;
  /** State key to bind the value to */
  bind: string;
  validation?: AdaptiveValidation;
}

export interface SelectNode extends AdaptiveNodeBase {
  type: 'select';
  label?: string;
  options: Array<{ label: string; value: string }>;
  bind: string;
}

export interface ImageNode extends AdaptiveNodeBase {
  type: 'image';
  src: string;
  alt?: string;
}

export interface ContainerNode extends AdaptiveNodeBase {
  type: 'container';
  children: AdaptiveNode[];
}

export interface ColumnsNode extends AdaptiveNodeBase {
  type: 'columns';
  children: AdaptiveNode[];
  /** Column width ratios, e.g. ["1","2"] → 1fr 2fr. Defaults to equal widths. */
  sizes?: string[];
  /** Gap between columns, e.g. "16px". Defaults to 16px. */
  gap?: string;
}

export interface CardNode extends AdaptiveNodeBase {
  type: 'card';
  title?: string;
  subtitle?: string;
  children?: AdaptiveNode[];
  onClick?: AdaptiveAction;
}

export interface ListNode extends AdaptiveNodeBase {
  type: 'list';
  /** State key that holds the array of items */
  items: string | Array<Record<string, AdaptiveValue>>;
  /** Template to render for each item — use {{item.key}} for interpolation */
  itemTemplate: AdaptiveNode;
}

export interface TableNode extends AdaptiveNodeBase {
  type: 'table';
  columns: Array<{ key: string; header: string; width?: string }>;
  rows: string | Array<Record<string, AdaptiveValue>>;
}

export interface FormNode extends AdaptiveNodeBase {
  type: 'form';
  children: AdaptiveNode[];
  onSubmit: AdaptiveAction;
}

export interface TabsNode extends AdaptiveNodeBase {
  type: 'tabs';
  tabs: Array<{
    label: string;
    id: string;
    children: AdaptiveNode[];
  }>;
}

export interface ProgressNode extends AdaptiveNodeBase {
  type: 'progress';
  value: number | string;
  max?: number;
  label?: string;
}

export interface AlertNode extends AdaptiveNodeBase {
  type: 'alert';
  severity: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  content: string;
}

export interface ChatInputNode extends AdaptiveNodeBase {
  type: 'chatInput';
  placeholder?: string;
}

export interface MarkdownNode extends AdaptiveNodeBase {
  type: 'markdown';
  content: string;
}

export interface RadioGroupNode extends AdaptiveNodeBase {
  type: 'radioGroup';
  label?: string;
  options: Array<{ label: string; value: string; description?: string }>;
  bind: string;
}

export interface MultiSelectNode extends AdaptiveNodeBase {
  type: 'multiSelect';
  label?: string;
  options: Array<{ label: string; value: string; description?: string }>;
  bind: string;
}

export interface ToggleNode extends AdaptiveNodeBase {
  type: 'toggle';
  label?: string;
  description?: string;
  bind: string;
}

export interface SliderNode extends AdaptiveNodeBase {
  type: 'slider';
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  bind: string;
}

export interface DividerNode extends AdaptiveNodeBase {
  type: 'divider';
  label?: string;
}

export interface BadgeNode extends AdaptiveNodeBase {
  type: 'badge';
  content: string;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple';
}

export interface AccordionNode extends AdaptiveNodeBase {
  type: 'accordion';
  items: Array<{ label: string; id: string; children: AdaptiveNodeBase[] }>;
}

export interface CodeBlockNode extends AdaptiveNodeBase {
  type: 'codeBlock';
  code: string;
  language?: string;
  label?: string;
}

export interface LinkNode extends AdaptiveNodeBase {
  type: 'link';
  label: string;
  href: string;
  external?: boolean;
}

// ─── Union of all node types ───
export type AdaptiveNode =
  | TextNode
  | ButtonNode
  | InputNode
  | SelectNode
  | ImageNode
  | ContainerNode
  | ColumnsNode
  | CardNode
  | ListNode
  | TableNode
  | FormNode
  | TabsNode
  | ProgressNode
  | AlertNode
  | ChatInputNode
  | MarkdownNode
  | RadioGroupNode
  | MultiSelectNode
  | ToggleNode
  | SliderNode
  | DividerNode
  | BadgeNode
  | AccordionNode
  | CodeBlockNode
  | LinkNode
  | AdaptiveNodeBase; // fallback for custom components

// ─── Top-level UI spec returned by the LLM ───
export interface AdaptiveUISpec {
  /** Version for forward compat */
  version?: string;

  /** Page/screen title */
  title?: string;

  /** Top-level layout */
  layout: AdaptiveNode;

  /** Initial state values */
  state?: Record<string, AdaptiveValue>;

  /** Short message the agent shows above the interactive UI */
  agentMessage?: string;

  /** System prompt context for the LLM */
  systemPrompt?: string;

  /** Theme overrides */
  theme?: AdaptiveTheme;

  /** Mermaid diagram definition (e.g. architecture diagram) */
  diagram?: string;
}

// ─── Conversation turn ───
export interface ConversationTurn {
  id: string;
  /** What the user said or did */
  userMessage?: string;
  /** Structured data the user submitted (form fields, selections) */
  userData?: Record<string, unknown>;
  /** The agent's response spec */
  agentSpec: AdaptiveUISpec;
  /** Timestamp */
  timestamp: number;
}

// ─── Theme ───
export interface AdaptiveTheme {
  primaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  borderRadius?: string;
  fontFamily?: string;
  spacing?: string;
}
