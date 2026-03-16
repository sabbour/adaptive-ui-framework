# Adaptive UI — Copilot Instructions

## Project Overview

Adaptive UI is a React + TypeScript framework for building conversational, AI-agent-driven UIs powered by LLMs. The LLM orchestrates multi-turn conversations, dynamically generating JSON specs (`AdaptiveUISpec`) that the client renders into interactive components.

## Quick Reference

```bash
npm install          # Install dependencies
npm run dev          # Dev server (Vite + HMR, auto-opens browser)
npm run build        # Type-check (tsc) + production bundle
npm run preview      # Preview production build
```

No test framework is configured yet.

## Architecture

```
User action → AdaptiveApp → LLM + Pack Skills → AdaptiveUISpec (JSON) → Component Registry → Renderer → UI
```

### Key Modules

| Module | Role |
|---|---|
| `src/framework/schema.ts` | All TypeScript types: `AdaptiveUISpec`, `AdaptiveNode`, component node types |
| `src/framework/registry.ts` | Component registry + pack system (`registerComponent`, `registerPackWithSkills`) |
| `src/framework/renderer.tsx` | Recursive renderer: maps `AdaptiveNode` tree → React tree |
| `src/framework/context.tsx` | React context + `useAdaptive()` / `useAdaptiveState()` hooks, state reducer |
| `src/framework/llm-adapter.ts` | `LLMAdapter` interface, `OpenAIAdapter`, `MockAdapter`, endpoint normalization |
| `src/framework/interpolation.ts` | `{{state.key}}` / `{{item.key}}` template resolution |
| `src/framework/compact.ts` | Compact JSON notation for LLM output (~40% token savings) |
| `src/framework/sanitize.ts` | XSS prevention: URL, style, and state key sanitization |
| `src/framework/AdaptiveApp.tsx` | Top-level orchestrator component + settings panel |
| `src/framework/components/builtins.tsx` | All 24 built-in component implementations |
| `src/framework/components/ConversationThread.tsx` | Turn history + active turn UI |

### Directory Structure

| Directory | Purpose |
|---|---|
| `src/framework/` | Core runtime (rendering, schema, registry, context, hooks) |
| `src/framework/components/` | Built-in components + conversation UI |
| `src/packs/` | Extension bundles (Azure pack ships as reference) |
| `src/demo/` | Example apps (Solution Architect demo) |
| `src/framework/css/` | Design tokens + component styles |

## Conventions

### Components

- **Component type** = lowercase string key (e.g., `"text"`, `"radioGroup"`, `"chatInput"`).
- Registration: `registerComponent("myType", MyComponent)`.
- All component props interfaces extend `AdaptiveNodeBase` in `schema.ts`.
- Component receives `{ node }` prop typed as `AdaptiveComponentProps<T>`.
- Use `useAdaptive()` for state/dispatch, `renderChildren(node.children)` for child rendering.
- Built-in components live in one file: `builtins.tsx`. Keep new built-ins there.

### State & Interpolation

- State keys starting with `__` (double underscore) are internal/sensitive: redacted from UI, blocked in URL interpolation.
- Patterns matching `token`, `apiKey`, `secret`, `password`, `credential` are also treated as sensitive.
- `{{state.key}}` interpolation works in any string prop. `{{item.key}}` works inside list templates.

### Packs (Extensions)

A `ComponentPack` bundles: components, system prompt, knowledge skills resolver, and optional settings UI. See `src/packs/azure/` as the reference implementation.

- Register via `registerPackWithSkills(pack)`.
- Pack system prompts are concatenated into the LLM context automatically.
- `resolveSkills(prompt)` fetches domain knowledge on demand per user message.

### Path Alias

`@adaptive-ui/*` maps to `./src/framework/*` (configured in `vite.config.ts` and `tsconfig.json`).

### Security Rules

- All LLM-produced specs pass through `sanitize.ts` before rendering.
- URLs block `javascript:`, `vbscript:`, and non-image `data:` protocols.
- CSS strips `expression()` and `unicode-range` injection vectors.
- Sensitive state keys cannot be interpolated into URLs.

## LLM Integration Notes

- `OpenAIAdapter` auto-detects Azure AI Foundry, Azure OpenAI, plain OpenAI, and generic compatible endpoints.
- The system prompt is composed from: base prompt + compact notation rules + pack prompts + app-specific suffix.
- LLM JSON output uses compact keys (e.g., `t` for `type`, `lb` for `label`). Client expands via `expandCompact()`.

## Common Patterns

### Adding a new built-in component

1. Define the node type interface in `schema.ts` (extend `AdaptiveNodeBase`).
2. Add the type to the `AdaptiveNode` union in `schema.ts`.
3. Implement the component in `builtins.tsx`.
4. Register with `registerComponent("typeName", MyComponent)` at the bottom of `builtins.tsx`.
5. Add compact key mappings in `compact.ts` if needed.

### Creating a new pack

1. Create a directory under `src/packs/your-pack/`.
2. Export a `create*Pack()` function returning a `ComponentPack`.
3. Register in `src/main.tsx` via `registerPackWithSkills()`.

### Adding a new demo app

1. Create a file in `src/demo/`.
2. Register it in `src/main.tsx` using `registerApp()`.
