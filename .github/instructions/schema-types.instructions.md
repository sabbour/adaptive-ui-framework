---
applyTo: "src/framework/schema.ts"
description: "Enforces AdaptiveNodeBase extension pattern, literal type fields, and AdaptiveNode union ordering for node type definitions."
---

# Schema Type Conventions

## Node Interface Pattern

Every node type interface must:

1. **Extend `AdaptiveNodeBase`** — inherits `id`, `style`, `className`, `visible`, `props`
2. **Declare a literal `type` field** — string literal, not `string`
3. **Be exported individually** — `export interface XNode`

```typescript
export interface MyNode extends AdaptiveNodeBase {
  type: 'myComponent';   // literal string, must match registration key
  // ... component-specific props
}
```

## Node Categories

| Pattern | Required props | Example |
|---------|---------------|---------|
| Display-only | `content` or `label` | `TextNode`, `BadgeNode` |
| Input (state-binding) | `bind: string` | `InputNode`, `SliderNode`, `ToggleNode` |
| Container | `children: AdaptiveNode[]` | `ContainerNode`, `FormNode` |
| Action-bearing | `onClick: AdaptiveAction` or `onSubmit: AdaptiveAction` | `ButtonNode`, `CardNode` |

- Input nodes may include `validation?: AdaptiveValidation`
- Optional enum props use union literals: `variant?: 'primary' | 'secondary'`
- Boolean props that support interpolation: `disabled?: boolean | string`

## AdaptiveNode Union

New types go **before** the final `AdaptiveNodeBase` fallback:

```typescript
export type AdaptiveNode =
  | TextNode
  // ... existing types ...
  | MyNewNode          // ← add here
  | AdaptiveNodeBase;  // fallback — must stay LAST
```

## Do Not

- Do not use `type: string` — always use a string literal
- Do not add default exports — all types are named exports
- Do not duplicate `AdaptiveNodeBase` fields (`id`, `style`, `className`, `visible`, `props`)
- Do not nest custom interfaces inside node types — define them separately (e.g., `AdaptiveValidation`)
