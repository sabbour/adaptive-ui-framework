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

Two modes: **intent-based** (token-efficient) and **full-spec** (maximum layout control).

```
Intent mode:   User action → LLM → AgentIntent (JSON) → Intent Resolver → AdaptiveUISpec → Renderer → UI
Full-spec mode: User action → LLM → AdaptiveUISpec (JSON) → Component Registry → Renderer → UI
```

Enable intent mode with `useIntents: true` in `OpenAIAdapterConfig`. The resolver auto-selects components (e.g., ≤5 options → `radioGroup`, >5 → `select`). The LLM can fall back to raw `layout` for complex cases.

### Key Modules

| Module | Role |
|---|---|
| `src/framework/schema.ts` | All TypeScript types: `AdaptiveUISpec`, `AdaptiveNode`, component node types |
| `src/framework/intent-schema.ts` | Intent types: `AgentIntent`, `AskIntent`, `ShowIntent` |
| `src/framework/intent-resolver.ts` | `resolveIntent()`: maps `AgentIntent` → `AdaptiveUISpec`. Has `normalizeAskType()` for LLM alias handling. |
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
| `src/framework/app-router.tsx` | URL hash-based app router + 40px fixed top bar (`AppSwitcher`) |

### Directory Structure

| Directory | Purpose |
|---|---|
| `src/framework/` | Core runtime (rendering, schema, registry, context, hooks) |
| `src/framework/components/` | Built-in components + conversation UI |
| `src/packs/` | Extension bundles (Azure pack ships as reference) |
| `src/demo/` | Example apps (Solution Architect demo) |
| `src/framework/css/` | Design tokens + component styles |

## Conventions

### TypeScript & Build

- **Target: ES2020.** Do not use ES2021+ APIs (e.g., `String.replaceAll`). Use `split().join()` instead.
- All framework-level code uses `React.createElement()`, not JSX. This is intentional — match the existing style.
- Run `npm run build` (tsc + vite) to verify changes. The only pre-existing warning is strict-mode related.

### Layout & Positioning

- **App router renders a 40px fixed top bar** (`position: fixed; top: 0; z-index: 1000`). App content renders below it via `margin-top: 40px; height: calc(100vh - 40px)`.
- **Settings button** uses `position: fixed; top: 6px; right: 12px; z-index: 1001` to sit inside the top bar. Its dropdown uses `position: absolute` relative to the button wrapper.
- **Do not use `position: fixed` on the app content container** — it creates a stacking context that traps child z-indexes. Use `margin-top` + `calc(100vh - 40px)` instead.
- Demo apps should use `height: 100%` (not `100vh`) since they render inside the router's content container.

### Components

- **Component type** = lowercase string key (e.g., `"text"`, `"radioGroup"`, `"chatInput"`).
- Registration: `registerComponent("myType", MyComponent)`.
- All component props interfaces extend `AdaptiveNodeBase` in `schema.ts`.
- Component receives `{ node }` prop typed as `AdaptiveComponentProps<T>`.
- Use `useAdaptive()` for state/dispatch, `renderChildren(node.children)` for child rendering.
- Built-in components live in one file: `builtins.tsx`. Keep new built-ins there.

### State & Interpolation

- State keys starting with `__` (double underscore) are internal/sensitive: redacted from UI, blocked in URL interpolation, and **filtered from the state sent to the LLM**.
- Patterns matching `token`, `apiKey`, `secret`, `password`, `credential` are also treated as sensitive.
- `{{state.key}}` interpolation works in any string prop. `{{item.key}}` works inside list templates.
- **The LLM never sees `__`-prefixed state.** Data that requires API calls to populate (regions, resource groups, subscriptions, SKUs) must be handled client-side via intent resolvers or components — never hardcoded by the LLM.

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
- **Intent mode** (`useIntents: true`): uses `INTENT_SYSTEM_PROMPT` (~400 tokens) + `INTENT_COMPACT_PROMPT`. LLM outputs `AgentIntent` with `ask`/`show` arrays. Client resolves to `AdaptiveUISpec` via `resolveIntent()`.
- **Full-spec mode** (default): uses `ADAPTIVE_UI_SYSTEM_PROMPT` (~1,200 tokens) + `COMPACT_PROMPT`. LLM outputs compact `AdaptiveUISpec` directly. Client expands via `expandCompact()`.
- In intent mode, pack components are accessed via `{ type: "component", component: "azureLogin", props: {} }` ask type.
- **Intent resolver is tolerant**: `normalizeAskType()` maps LLM component names (e.g., `radioGroup`, `input`, `select`) back to intent types. Unknown types pass through as raw component nodes. When adding new intent types, also add aliases in `ASK_TYPE_ALIASES`.
- **API-populated data belongs on the client**: Lists that require API calls (regions, resource groups, SKUs) should use pack-registered intent resolvers (e.g., `azure-regions`) or dynamic components — the LLM should never hardcode these options.

### Mermaid Diagrams

- Architecture diagrams use **Mermaid `block-beta`** syntax with `columns 1` for vertical layout.
- Groups use `block:id["Label"] ... end`. The renderer auto-fixes `subgraph` → `block:` if the LLM gets it wrong.
- Arrows (`-->`) go AFTER all block definitions.
- Icon placeholders: `%%icon:azure/aks%%` prefix in node labels.
- Diagram value is a plain string with `\n` for newlines, no backticks.

## Common Patterns

### Adding a new built-in component

1. Define the node type interface in `schema.ts` (extend `AdaptiveNodeBase`).
2. Add the type to the `AdaptiveNode` union in `schema.ts`.
3. Implement the component in `builtins.tsx`.
4. Register with `registerComponent("typeName", MyComponent)` at the bottom of `builtins.tsx`.
5. Add compact key mappings in `compact.ts` if needed.
6. If the component maps to a semantic intent (e.g., a new input type), add a case in `intent-resolver.ts` and an alias in `ASK_TYPE_ALIASES`.

### Creating a new pack

1. Create a directory under `src/packs/your-pack/`.
2. Export a `create*Pack()` function returning a `ComponentPack`.
3. Register in `src/main.tsx` via `registerPackWithSkills()`.

### Adding a new demo app

1. Create a file in `src/demo/`.
2. Register it in `src/main.tsx` using `registerApp()`.
