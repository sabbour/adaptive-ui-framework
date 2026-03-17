---
name: component-authoring
description: "Scaffold a new Adaptive UI component end-to-end. Use when: adding a built-in component, creating a component type, defining a node interface, registering a component, adding compact key mappings."
---

# Component Authoring

Scaffold a new built-in component for the Adaptive UI framework, covering all required touchpoints: schema type, implementation, registration, and compact mappings.

## When to Use

- Adding a new built-in component type
- Need the exact interfaces, patterns, and registration steps

## Procedure

### Step 1 — Define the node type in `src/framework/schema.ts`

Create an interface extending `AdaptiveNodeBase`. Set `type` as a string literal.

```typescript
// Base interface all nodes extend:
interface AdaptiveNodeBase {
  type: string;
  id?: string;
  style?: AdaptiveStyle;
  className?: string;
  visible?: boolean | string;
  props?: Record<string, unknown>;
}
```

**Pattern — simple (display-only):**
```typescript
export interface MyComponentNode extends AdaptiveNodeBase {
  type: 'myComponent';
  content: string;
  variant?: 'option1' | 'option2';
}
```

**Pattern — with state binding (input):**
```typescript
export interface MyComponentNode extends AdaptiveNodeBase {
  type: 'myComponent';
  label?: string;
  bind: string;           // state key to read/write
  placeholder?: string;
  min?: number;
  max?: number;
}
```

**Pattern — with children:**
```typescript
export interface MyComponentNode extends AdaptiveNodeBase {
  type: 'myComponent';
  title?: string;
  children?: AdaptiveNode[];
}
```

**Pattern — with action:**
```typescript
export interface MyComponentNode extends AdaptiveNodeBase {
  type: 'myComponent';
  label: string;
  disabled?: boolean | string;
  onClick: AdaptiveAction;
}
```

Then add to the `AdaptiveNode` union:
```typescript
export type AdaptiveNode =
  | TextNode
  | ButtonNode
  // ... existing types ...
  | MyComponentNode      // ← add here
  | AdaptiveNodeBase;    // fallback must stay last
```

Also add the type to the import/export list in the file.

### Step 2 — Implement in `src/framework/components/builtins.tsx`

Add the import of your node type to the existing type import block:
```typescript
import type {
  TextNode, ButtonNode, /* ... existing ... */,
  MyComponentNode,     // ← add here
} from '../schema';
```

**Pattern — display-only component:**
```typescript
function MyComponent({ node }: AdaptiveComponentProps<MyComponentNode>) {
  return React.createElement('div', {
    style: { ...node.style } as React.CSSProperties,
    className: node.className,
  }, node.content);
}
```

**Pattern — state-binding component:**
```typescript
function MyComponent({ node }: AdaptiveComponentProps<MyComponentNode>) {
  const { state, dispatch } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';

  return React.createElement('div', {
    style: { marginBottom: '12px', ...node.style } as React.CSSProperties,
  },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 },
    }, node.label),
    React.createElement('input', {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch({ type: 'SET', key: node.bind, value: e.target.value });
      },
      placeholder: node.placeholder,
      style: {
        width: '100%', padding: '8px 12px', borderRadius: '6px',
        border: '1px solid #d1d5db', fontSize: '14px',
        boxSizing: 'border-box' as const,
      },
      className: node.className,
    })
  );
}
```

**Pattern — container component with children:**
```typescript
function MyComponent({ node }: AdaptiveComponentProps<MyComponentNode>) {
  return React.createElement('div', {
    style: { ...node.style } as React.CSSProperties,
    className: node.className,
  },
    node.title && React.createElement('h3', {
      style: { fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' },
    }, node.title),
    renderChildren(node.children)
  );
}
```

Key conventions:
- Use `React.createElement()`, not JSX (matches existing code style)
- Spread `node.style` last so LLM-provided styles override defaults
- Use `useAdaptive()` for `state` and `dispatch`
- Use `renderChildren(node.children)` for child nodes
- Use `sanitizeUrl()` for any user/LLM-provided URLs
- State dispatch: `dispatch({ type: 'SET', key: node.bind, value: newValue })`

### Step 3 — Register the component

Add to the `registerBuiltinComponents()` function at the bottom of `builtins.tsx`:

```typescript
export function registerBuiltinComponents(): void {
  registerComponents({
    // ... existing entries ...
    myComponent: MyComponent,    // ← add here
  });
}
```

### Step 4 — Add compact key mappings in `src/framework/compact.ts`

Add a short alias to `TYPE_MAP`:
```typescript
const TYPE_MAP: Record<string, string> = {
  // ... existing ...
  myc: 'myComponent',    // ← 2-3 char abbreviation
};
```

If the component has custom props not already in `KEY_MAP`, add them:
```typescript
const KEY_MAP: Record<string, string> = {
  // ... existing ...
  myp: 'myCustomProp',   // ← only if not already mapped
};
```

Existing mappings to reuse (do NOT duplicate):
- `l` / `lb` → `label`, `b` → `bind`, `c` → `content`, `ph` → `placeholder`
- `vr` → `variant`, `dis` → `disabled`, `oc` → `onClick`, `ch` → `children`
- `mn` → `min`, `mx` → `max`, `stp` → `step`, `d` → `description`

### Step 5 — Add intent resolver mapping (if applicable)

If the component maps to a semantic intent (e.g., a new input type, display type), add a case in `src/framework/intent-resolver.ts`:

- For input components: add a case in `resolveAsk()` mapping an ask type to the component
- For display components: add a case in `resolveShow()` mapping a show type to the component
- Also update `src/framework/intent-schema.ts` to add the new ask/show type to the union

Skip this step if the component is only used via raw `layout` (escape hatch) or via pack `component` ask type.

### Step 5b — Consider registering a tool (for pack components)

If this is a **pack component** that calls an external API (e.g., Azure ARM, GitHub REST), consider whether the LLM would benefit from calling that API **during inference** (before generating the UI).

- **Register a read-only tool** if the LLM needs API data to make decisions (e.g., list existing resources, check repo details)
- **Keep as component only** if the operation requires user interaction (login, confirmation, write operations)

Tools are registered in the pack's `createXPack()` function via the `tools` array:

```typescript
tools: [
  {
    definition: {
      type: 'function',
      function: {
        name: '<pack>_api_get',
        description: 'Read-only API call. Use to check data before generating UI.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    },
    handler: async (args) => {
      const res = await trackedFetch(`https://api.example.com${args.path}`, { headers: { Authorization: `Bearer ${token}` } });
      return JSON.stringify(await res.json(), null, 2).slice(0, 8000);
    },
  },
],
```

Document the tool in the pack's system prompt under a TOOLS section.

### Step 6 — Verify

Run `npm run build` to confirm TypeScript compilation passes.

## Checklist

- [ ] Node interface in `schema.ts` extends `AdaptiveNodeBase` with literal `type`
- [ ] Type added to `AdaptiveNode` union (before final `AdaptiveNodeBase`)
- [ ] Type added to import block in `builtins.tsx`
- [ ] Component function implemented in `builtins.tsx`
- [ ] Component registered in `registerBuiltinComponents()`
- [ ] Compact type alias added to `TYPE_MAP` in `compact.ts`
- [ ] Any new props added to `KEY_MAP` in `compact.ts`
- [ ] Intent resolver mapping added in `intent-resolver.ts` (if applicable)
- [ ] Pack tool registered for read-only API access (if applicable)
- [ ] `npm run build` succeeds
