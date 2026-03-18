// ─── Intent Resolver ───
// Maps semantic AgentIntent → concrete AdaptiveUISpec.
// The LLM outputs a small intent JSON; this module expands it into
// the full component tree that the renderer understands.

import type { AdaptiveUISpec, AdaptiveNode, AdaptiveAction } from './schema';
import type { AgentIntent, AskIntent, ShowIntent } from './intent-schema';
import { getIntentResolver, hasComponent } from './registry';
import { logDecision } from './decision-log';

// ─── Normalize LLM ask types ───
// LLMs sometimes output component names (radioGroup, input, select) instead of
// intent type names (choice, text). Map them back to the intent vocabulary.

const ASK_TYPE_ALIASES: Record<string, string> = {
  // Component names → intent types
  radiogroup: 'choice', radioGroup: 'choice', radio: 'choice',
  select: 'choice', dropdown: 'choice',
  multiselect: 'choice', multiSelect: 'choice',
  input: 'text', textinput: 'text', textInput: 'text',
  textarea: 'textarea',
  number: 'number', email: 'email', date: 'date',
  toggle: 'toggle', switch: 'toggle',
  slider: 'slider', range: 'slider',
  chatinput: 'free-text', chatInput: 'free-text', freetext: 'free-text', freeText: 'free-text',
  component: 'component',
  // Intent types pass through
  choice: 'choice', text: 'text',
  'free-text': 'free-text',
};

function normalizeAskType(type: string): string {
  return ASK_TYPE_ALIASES[type] ?? 'passthrough';
}

function getAskBind(ask: any): string | undefined {
  return ask.key ?? ask.bind ?? ask.props?.bind ?? ask.props?.key;
}

function normalizeUnknownAskNode(ask: any): AdaptiveNode {
  return {
    ...ask,
    ...(ask.bind || ask.key ? { bind: ask.bind ?? ask.key } : {}),
  } as AdaptiveNode;
}

// ─── Ask → AdaptiveNode ───

function resolveAsk(ask: AskIntent): AdaptiveNode {
  // Normalize type — LLMs sometimes use component names instead of intent names
  const type = normalizeAskType(ask.type);
if (type !== ask.type && type !== 'passthrough') {
    logDecision('intent', `LLM used component name "${ask.type}" as the ask type — mapped it to semantic intent "${type}"`);
  }

  switch (type) {
    case 'choice': {
      const a = ask as any;
      const isMulti = a.multiple || (ask as any).type === 'multiSelect' || (ask as any).type === 'multiselect';
      if (isMulti) {
        logDecision('intent', `"${a.label || a.key}" is a multi-select choice — rendering as checkboxes (multiSelect)`);
        return {
          type: 'multiSelect',
          label: a.label,
          options: a.options,
          bind: a.key ?? a.bind,
        } as AdaptiveNode;
      }
      // ≤5 options → radioGroup (all visible), >5 → select (dropdown)
      const componentType = (a.options?.length ?? 0) <= 5 ? 'radioGroup' : 'select';
      logDecision('intent', `"${a.label || a.key}" has ${a.options?.length ?? 0} options — rendering as ${componentType === 'radioGroup' ? 'radio buttons (≤5 options, all visible)' : 'searchable dropdown (>5 options)'}`);
      return {
        type: componentType,
        label: a.label,
        options: a.options,
        bind: a.key ?? a.bind,
      } as AdaptiveNode;
    }

    case 'text':
    case 'number':
    case 'email':
    case 'date':
    case 'textarea':
      return {
        type: 'input',
        inputType: type === 'text' ? undefined : type,
        label: (ask as any).label,
        placeholder: (ask as any).placeholder,
        bind: (ask as any).key ?? (ask as any).bind,
      } as AdaptiveNode;

    case 'toggle':
      return {
        type: 'toggle',
        label: (ask as any).label,
        description: (ask as any).description,
        bind: (ask as any).key ?? (ask as any).bind,
      } as AdaptiveNode;

    case 'slider':
      return {
        type: 'slider',
        label: (ask as any).label,
        min: (ask as any).min,
        max: (ask as any).max,
        step: (ask as any).step,
        bind: (ask as any).key ?? (ask as any).bind,
      } as AdaptiveNode;

    case 'free-text':
      return {
        type: 'chatInput',
        placeholder: (ask as any).placeholder,
      } as AdaptiveNode;

    case 'component':
      logDecision('intent', `LLM requested pack component "${(ask as any).component}" — passing to registered component renderer`);
      return {
        type: (ask as any).component,
        ...(ask as any).props,
      } as AdaptiveNode;

    default: {
      // Check pack-registered intent resolvers (e.g., azure-regions, azure-resource-groups)
      const resolver = getIntentResolver(type) || getIntentResolver(ask.type);
      if (resolver) {
        logDecision('intent', `"${ask.type}" matched a pack-registered resolver — it will fetch live data from an API and render a picker`);
        return resolver.resolve(ask as any);
      }
      // Check if the type is a registered component (e.g., azureLogin, azureResourceForm)
      if (hasComponent(ask.type)) {
        logDecision('intent', `"${ask.type}" is a registered component — rendering directly (self-managed, no Continue button needed)`);
        return {
          type: ask.type,
          ...(ask as any).props,
        } as AdaptiveNode;
      }
      // Passthrough: LLM sent a raw component node — pass it through directly
      if ((ask as any).bind || (ask as any).key) {
        logDecision('intent', `"${ask.type}" is not a known intent type, but it has a state binding "${(ask as any).bind || (ask as any).key}" — passing through as-is and hoping the renderer can infer a control`);
        return normalizeUnknownAskNode(ask as any);
      }
      logDecision('intent', `"${ask.type}" is not a known ask type and has no state binding — cannot render it, showing placeholder text instead`);
      return { type: 'text', content: `[Unknown ask type: ${ask.type}]` } as AdaptiveNode;
    }
  }
}

// ─── Show → AdaptiveNode ───

function resolveShow(show: ShowIntent): AdaptiveNode {
  switch (show.type) {
    case 'info':
    case 'success':
    case 'warning':
    case 'error':
      return {
        type: 'alert',
        severity: show.type,
        title: show.title,
        content: show.content,
      } as AdaptiveNode;

    case 'markdown':
      return {
        type: 'markdown',
        content: show.content,
      } as AdaptiveNode;

    case 'table':
      return {
        type: 'table',
        columns: show.columns,
        rows: show.rows,
      } as AdaptiveNode;

    case 'progress':
      return {
        type: 'progress',
        value: show.value,
        max: show.max,
        label: show.label,
      } as AdaptiveNode;

    case 'code':
      return {
        type: 'codeBlock',
        code: show.code || (show as any).content,
        language: show.language,
        label: (show as any).label,
      } as AdaptiveNode;

    default: {
      // Check if show.type itself is a registered component (LLM put component in show instead of ask)
      const showType = (show as any).type as string;
      if (hasComponent(showType)) {
        logDecision('intent', `LLM placed registered component "${showType}" inside "show" instead of "ask" — rendering it as a component`);
        const { type: _t, ...rest } = show as any;
        return { type: showType, ...rest } as AdaptiveNode;
      }
      // Check if it's a { type: "component", component: "name", props: {} } pattern in show
      const s = show as any;
      const compName = s.component ?? s.comp;
      if (compName && typeof compName === 'string' && hasComponent(compName)) {
        logDecision('intent', `LLM placed component ask "${compName}" inside "show" instead of "ask" — rendering it as a component`);
        return { type: compName, ...(s.props || {}) } as AdaptiveNode;
      }
      // Fallback: check content/c fields for a component name
      const contentName = s.content ?? s.c;
      if (contentName && typeof contentName === 'string' && hasComponent(contentName)) {
        logDecision('intent', `LLM placed component "${contentName}" inside "show" via content field — rendering as component`);
        const { type: _t2, content: _c, ...rest2 } = s;
        return { type: contentName, ...rest2 } as AdaptiveNode;
      }
      logDecision('intent', `"${showType}" is not a recognized show type (expected info/success/warning/error/markdown/table/progress/code) — showing placeholder`);
      return { type: 'text', content: `[Unknown show type: ${showType}]` } as AdaptiveNode;
    }
  }
}

// ─── Intent → AdaptiveUISpec ───

export function resolveIntent(intent: AgentIntent): AdaptiveUISpec {
  const askCount = intent.ask?.length ?? 0;
  const showCount = intent.show?.length ?? 0;
  const askTypes = intent.ask?.map((a: any) => a.type).join(', ') || 'none';
  const showTypes = intent.show?.map((s: any) => s.type).join(', ') || 'none';
  logDecision('intent', `Resolving intent: ${askCount} ask(s) [${askTypes}], ${showCount} show(s) [${showTypes}], next=${intent.next ? `"${intent.next.slice(0, 60)}..."` : 'not set'}${intent.layout ? ', has raw layout' : ''}${intent.diagram ? ', has diagram' : ''}`);

  // Escape hatch: if the LLM provided a raw layout, use it directly
  if (intent.layout) {
    logDecision('intent', 'LLM provided a raw "layout" field in the intent — skipping intent resolution and using it as a full UI spec directly');
    return {
      version: '1',
      title: intent.title,
      agentMessage: intent.message,
      layout: intent.layout,
      state: intent.state,
      theme: intent.theme,
      diagram: intent.diagram,
    };
  }

  // Build the children array from show + ask intents
  const children: AdaptiveNode[] = [];

  // Show intents come first (informational content)
  if (intent.show) {
    for (const show of intent.show) {
      children.push(resolveShow(show));
    }
  }

  // Normalize ask: LLMs sometimes put components in a top-level "component"/"comp" field
  let askItems = intent.ask;
  const raw = intent as any;
  if (!askItems && (raw.component || raw.comp)) {
    logDecision('intent', 'LLM put components in a top-level "component" or "comp" field instead of inside "ask" — restructured them into proper ask items');
    const comps = raw.component || raw.comp;
    askItems = (Array.isArray(comps) ? comps : [comps]).map((c: any) => ({
      type: 'component' as const,
      component: c.type ?? c.component ?? c.comp ?? c.content ?? c.c ?? c.t,
      props: c,
    }));
  }

  // Ask intents (input fields)
  if (askItems) {
    // Check if the only ask is a free-text input (chatInput)
    const isFreeTextOnly = askItems.length === 1 && askItems[0].type === 'free-text';

    for (const ask of askItems) {
      children.push(resolveAsk(ask));
    }

    // Add a Continue button unless it's a free-text-only step (chatInput has its own submit)
    if (!isFreeTextOnly) {
      logDecision('intent', `Adding a Continue button — there are ${askItems.length} input(s) that need the user to confirm before advancing`);
      // Auto-generate a prompt that includes selected values if LLM didn't provide one
      let submitPrompt = intent.next;
      if (!submitPrompt) {
        logDecision('intent', 'LLM did not provide a "next" prompt for the Continue button — auto-generating one that includes the selected values');
        const binds = askItems
          .map((a: any) => getAskBind(a))
          .filter((k): k is string => Boolean(k))
          .map((k: string) => `${k}: {{state.${k}}}`);
        submitPrompt = binds.length > 0
          ? `User selected: ${binds.join(', ')}`
          : 'User submitted their selections';
      }
      const action: AdaptiveAction = {
        type: 'submit',
        prompt: submitPrompt,
      };
      children.push({
        type: 'button',
        label: 'Continue',
        variant: 'primary',
        onClick: action,
        style: { marginTop: '8px' },
      } as AdaptiveNode);
    } else {
      logDecision('intent', 'No Continue button needed — this step only has a free-text chat input which submits on Enter');
    }
  }

  // If no ask/show, just show the message with a free-text input
  if (children.length === 0) {
    logDecision('intent', 'LLM sent a message but no ask or show items — adding a free-text input so the user can respond');
    children.push({
      type: 'chatInput',
      placeholder: 'Type your response...',
    } as AdaptiveNode);
  }

  const layout: AdaptiveNode = children.length === 1
    ? children[0]
    : {
        type: 'container',
        children,
        style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      } as AdaptiveNode;

  const childTypes = children.map((c: any) => c.type).join(', ');
  logDecision('intent', `Final layout: ${children.length} component(s) → [${childTypes}]${intent.diagram ? ' + architecture diagram' : ''}`);

  return {
    version: '1',
    title: intent.title,
    agentMessage: intent.message,
    layout,
    state: intent.state,
    theme: intent.theme,
    diagram: intent.diagram,
  };
}

/** Check whether a parsed LLM response is an intent (vs. raw AdaptiveUISpec) */
export function isAgentIntent(parsed: Record<string, unknown>): boolean {
  // An intent has "message" (required) and optionally "ask"/"show"
  // A raw spec has "layout" or "agentMessage" at the top level
  return typeof parsed.message === 'string' && !parsed.agentMessage;
}
