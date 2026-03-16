---
applyTo: "src/framework/components/builtins.tsx"
description: "Enforces React.createElement style, state dispatch patterns, and CSS conventions for built-in component implementations."
---

# Built-in Component Code Style

## React.createElement (no JSX)

All components use `React.createElement()`. Never use JSX syntax in this file.

```typescript
// correct
React.createElement('div', { style: { ... } as React.CSSProperties }, children)

// wrong
<div style={{ ... }}>{children}</div>
```

Conditional rendering uses the AND pattern:
```typescript
node.label && React.createElement('label', { style: { ... } }, node.label)
```

## Component Function Signature

```typescript
function MyComponent({ node }: AdaptiveComponentProps<MyComponentNode>) {
```

- Destructure `{ node }` from props
- Type with `AdaptiveComponentProps<T>` where `T` is the node interface from `schema.ts`
- Name the function `XComponent` matching the type key (e.g., `text` → `TextComponent`)

## State Access & Dispatch

```typescript
const { state, dispatch } = useAdaptive();
const value = (state[node.bind] as string) ?? '';

dispatch({ type: 'SET', key: node.bind, value: newValue });
```

- Always cast state reads: `(state[key] as string) ?? ''`
- Boolean state stored as string: `'true'` / `'false'`
- Multi-select values joined: `selected.join(',')`

## Action Handlers

```typescript
const { handleAction } = useAdaptive();
handleAction(node.onClick);
```

For forms: `e.preventDefault()` then `handleAction(node.onSubmit)`.

## Style Conventions

- Cast all style objects: `as React.CSSProperties`
- Use `as const` for string literal CSS values: `boxSizing: 'border-box' as const`
- Spread `node.style` last: `{ ...defaults, ...node.style } as React.CSSProperties`
- Use CSS custom properties with fallbacks: `'var(--adaptive-primary, #2563eb)'`

Common values:
- Padding: `'8px 12px'` (controls), `'16px'` (cards)
- Border radius: `'6px'` (controls), `'4px'` (small), `'50%'` (circles)
- Font size: `'14px'` (body), `'13px'` (small), `'12px'` (captions)
- Font weight: `500` (labels), `600` (headers), `700` (h1)
- Border: `'1px solid #d1d5db'` (controls), `'2px solid var(--adaptive-primary, #2563eb)'` (selected)

## Children & URLs

- `renderChildren(node.children)` for child nodes, spread into parent: `...renderChildren(node.children)`
- `sanitizeUrl(url)` for any URL from node props

## Registration

Add to `registerBuiltinComponents()` at the bottom — alphabetical position in the object.
