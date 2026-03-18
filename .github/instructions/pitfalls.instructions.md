---
applyTo: "packs/**,apps/**"
description: "Framework-specific pitfalls and conventions. Cross-repo conventions are in the root repo's instructions."
---

# Adaptive UI Framework — Pitfalls & Conventions

## ES2020 Target

- **No ES2021+ APIs**: `String.replaceAll()`, `Array.at()`, `Object.hasOwn()` are not available.
- Use `split().join()` instead of `replaceAll`.

## React Style

- All framework code uses `React.createElement()`, **not JSX**. Match the existing style.

## Mermaid Diagrams

- Use **`flowchart TD`** with `subgraph`. Do **NOT** use `block-beta` or `block:` — it causes parse errors.

## Intent Resolver

- LLMs output component names (`radioGroup`, `input`, `select`) instead of intent types (`choice`, `text`). The resolver needs `normalizeAskType()` with alias mappings.
- LLMs put components in `show` instead of `ask`. The resolver checks `hasComponent(show.type)` to handle this.
- `{ type: "component", component: "name" }` wrapper nodes must be unwrapped in the renderer.
- Unknown component types should degrade to inferred built-ins or a visible placeholder, not `null`.

## Overflow Clipping

- The active turn layout container uses `overflow: hidden` when collapsed. Ensure it uses `overflow: visible` when the turn is active, or absolute-positioned dropdown panels will be invisible.
- **Always include deployment pipelines.** An architecture without a CI/CD pipeline or GitOps workflow is incomplete. The architect prompt must mandate pipeline generation alongside IaC — never leave deployment as an exercise for the reader.
- **Think like a real architect.** Discovery should cover delivery concerns (Git workflow, environment strategy, approval gates) not just infrastructure. Deliverables include pipeline YAML, Dockerfiles, environment configs, and rollback procedures — not just IaC files.
