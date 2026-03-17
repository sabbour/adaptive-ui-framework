---
applyTo: "src/**"
description: "Common pitfalls and conventions learned from iterative development. Prevents repeating known mistakes."
---

# Adaptive UI — Pitfalls & Conventions

## ES2020 Target

- **No ES2021+ APIs**: `String.replaceAll()`, `Array.at()`, `Object.hasOwn()` are not available.
- Use `split().join()` instead of `replaceAll`.

## React Style

- All framework code uses `React.createElement()`, **not JSX**. Match the existing style.

## Mermaid Diagrams

- Use **`flowchart TD`** with `subgraph`. Do **NOT** use `block-beta` or `block:` — it causes parse errors.
- LLMs frequently emit `block-beta` or `subgraph` in the wrong context. The system prompt must explicitly prohibit `block-beta` with a working `flowchart TD` example.

## Intent Resolver

- LLMs output component names (`radioGroup`, `input`, `select`) instead of intent types (`choice`, `text`). The resolver needs `normalizeAskType()` with alias mappings.
- LLMs put components in `show` instead of `ask`. The resolver checks `hasComponent(show.type)` to handle this.
- `{ type: "component", component: "name" }` wrapper nodes must be unwrapped in the renderer.
- Unknown component types should degrade to inferred built-ins or a visible placeholder, not `null`.

## State & Sensitive Keys

- `__`-prefixed keys are filtered from the LLM context. Display-friendly variants (e.g., `__azureSubscriptionName`) survive UI display but are still hidden from the LLM.
- The `sendPrompt` function carries a `userDisplayText` parameter to separate what the LLM sees from what the user bubble shows.

## System Prompts

- `"next"` field in intents must be factual data summaries (`"User selected: region: {{state.region}}"`), NOT agent prose (`"Great, I'll set up the resources"`).
- Components belong in `"ask"`, NEVER in `"show"`. Show is display-only.
- When tools are registered, `response_format: json_object` is omitted. The adapter retries with `response_format` if the final response isn't JSON.

## Tools vs Components

- **Tools** = read-only queries the LLM calls during inference (before generating UI). Run in the adapter loop.
- **Components** = interactive UI the user sees and interacts with. Run in the browser.
- Write operations (PUT/POST/DELETE) should always be components with user confirmation, never tools.

## Token Management

- `max_completion_tokens` defaults to 16384. Diagrams can consume 300-500 output tokens per response.
- Only include diagrams when the architecture changes — not on every step.
- History is auto-compacted when prompt tokens exceed 80k.
