---
description: "Scaffold a new built-in Adaptive UI component: node type, implementation, registration, and compact mappings."
argument-hint: "Component name and description, e.g. 'stepper — shows numbered steps with active/completed states'"
agent: "agent"
tools: [read, edit, search, execute]
---

Add a new built-in component to the Adaptive UI framework.

Follow the [component-authoring skill](../skills/component-authoring/SKILL.md) for the exact procedure, interfaces, and patterns.

## Task

Create a new built-in component named **$input** with these changes:

1. **`src/framework/schema.ts`** — Define the node type interface (extend `AdaptiveNodeBase`), add to the `AdaptiveNode` union
2. **`src/framework/components/builtins.tsx`** — Import the node type, implement the component using `React.createElement()`, add to `registerBuiltinComponents()`
3. **`src/framework/compact.ts`** — Add type alias to `TYPE_MAP` and any new prop keys to `KEY_MAP`
4. **`src/framework/intent-resolver.ts`** — If the component maps to a semantic intent (input or display type), add a case in `resolveAsk()` or `resolveShow()` and update `intent-schema.ts`. Skip if the component is only used via raw `layout` or pack `component` ask type.
5. **Verify** — Run `npm run build` to confirm compilation succeeds

## Constraints

- Use `React.createElement()`, not JSX (matches existing code style in builtins.tsx)
- Use `useAdaptive()` for state access and `dispatch({ type: 'SET', key, value })` for state updates
- Use `renderChildren()` for child node rendering
- Use `sanitizeUrl()` for any URL props
- Reuse existing compact key mappings where possible (see KEY_MAP in compact.ts)
