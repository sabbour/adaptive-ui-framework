# LLM Integration Pipeline

## Overview

Every user interaction that reaches the LLM follows a structured pipeline: prompt assembly, API call with tool-call loop, response parsing, spec expansion, and sanitization. This document traces a request from user input to rendered UI.

## Request Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│  1. USER INPUT                                                     │
│     User types text or clicks "Continue" button                    │
│     → sendPrompt(prompt, currentState) called                      │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  2. SKILL RESOLUTION                                               │
│     resolvePackSkills(prompt) → fetches domain knowledge           │
│     e.g., user mentions "AKS" → Azure pack injects ARM templates  │
│     Only new/changed skills are appended (not resent)              │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  3. SYSTEM PROMPT ASSEMBLY                                         │
│     Base prompt (Intent or Full-Spec mode)                         │
│     + Compact notation rules                                       │
│     + Intent resolver prompts (if intent mode)                     │
│     + All registered pack system prompts                           │
│     + Custom suffix (from app config)                              │
│     + Skills (domain knowledge fetched in step 2)                  │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  4. STATE FILTERING                                                │
│     Remove __-prefixed keys from state before sending              │
│     Remove keys matching: token, apiKey, secret, password, etc.    │
│     Filtered state becomes part of the user message context        │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  5. API REQUEST                                                    │
│     POST to OpenAI / Azure OpenAI / Azure AI Foundry               │
│     Includes: messages array, tool definitions, model config       │
│     Endpoint auto-detected from URL pattern                        │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  6. TOOL-CALL LOOP (up to 5 rounds)                                │
│     If response has tool_calls:                                    │
│       → Execute each tool (fetch_webpage, azure_arm_get, etc.)     │
│       → Append tool results to messages                            │
│       → Re-request from LLM                                       │
│     Repeat until LLM returns content (not tool calls)              │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  7. JSON PARSING & REPAIR                                          │
│     Strip markdown fences (```json ... ```)                        │
│     Escape unescaped newlines in string values                     │
│     If truncated → close open braces/brackets                      │
│     If still non-JSON → show raw text in agent bubble              │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  8. COMPACT EXPANSION                                              │
│     expandCompact() recursively expands abbreviated keys           │
│     e.g., { t: "rg", l: "Region", b: "region" }                   │
│       → { type: "radioGroup", label: "Region", bind: "region" }    │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  9. MODE-SPECIFIC RESOLUTION                                       │
│     Intent mode: isAgentIntent(obj)?                               │
│       → resolveIntent() maps ask/show → AdaptiveUISpec             │
│     Full-spec mode: use expanded spec directly                     │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  10. SANITIZATION                                                  │
│      sanitizeSpec() walks the entire spec tree                     │
│      → Block javascript:/vbscript: URLs                            │
│      → Strip expression() from CSS                                 │
│      → Mask sensitive state key interpolation in URLs              │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  11. RENDER                                                        │
│      AdaptiveProvider dispatches SET_SPEC                          │
│      ConversationThread renders active turn                        │
│      AdaptiveRenderer recursively builds React tree                │
│      Components bind to state, collect user input                  │
│      User interacts → cycle repeats from step 1                    │
└────────────────────────────────────────────────────────────────────┘
```

## Endpoint Auto-Detection

`OpenAIAdapter` normalizes the endpoint URL automatically:

| URL Pattern | Detected As | Normalization |
|---|---|---|
| `*.openai.azure.com*` | Azure OpenAI | Appends `/chat/completions?api-version=...` |
| `*.ai.azure.com*` or `*.services.ai.azure.com*` | Azure AI Foundry | Appends `/chat/completions` |
| `*api.openai.com*` | OpenAI | Uses as-is |
| Other | Generic compatible | Appends `/chat/completions` |

Authentication headers are set accordingly (`api-key` for Azure, `Authorization: Bearer` for OpenAI).

## System Prompt Composition

The system prompt is assembled from multiple sources, concatenated in order:

```
┌─────────────────────────────────────────────────────┐
│ 1. Base Prompt                                       │
│    Intent mode: INTENT_SYSTEM_PROMPT (~400 tokens)   │
│    Full-spec:   ADAPTIVE_UI_SYSTEM_PROMPT (~1.2K)    │
├─────────────────────────────────────────────────────┤
│ 2. Compact Notation Rules                            │
│    Key abbreviations, type mappings                  │
│    Teaches LLM the shorthand syntax                  │
├─────────────────────────────────────────────────────┤
│ 3. Intent Resolver Prompts (intent mode only)        │
│    Documents dynamic ask types from packs            │
│    e.g., "azure-regions", "github-orgs"              │
├─────────────────────────────────────────────────────┤
│ 4. Pack System Prompts                               │
│    Azure: tools, pickers, query components           │
│    GitHub: tools, pickers, PR creation               │
│    (concatenated from all registered packs)          │
├─────────────────────────────────────────────────────┤
│ 5. Custom Suffix                                     │
│    App-specific instructions                         │
│    e.g., Architect demo adds design methodology      │
├─────────────────────────────────────────────────────┤
│ 6. Skills (injected per-turn)                        │
│    Domain knowledge fetched based on user prompt     │
│    e.g., ARM PUT body templates for AKS              │
│    Only fresh/changed content appended               │
└─────────────────────────────────────────────────────┘
```

## Tool-Call Loop

When tools are registered, the adapter enables the OpenAI tool-calling protocol:

```
Round 1: LLM → "I need to check the existing resources"
         → tool_call: azure_arm_get({ path: "/subscriptions/.../clusters" })
         → Adapter executes tool, returns result
         → Appends tool result to messages

Round 2: LLM → "Let me also check the documentation"
         → tool_call: fetch_webpage({ url: "https://learn.microsoft.com/..." })
         → Adapter executes tool, returns result (max 6KB)
         → Appends tool result to messages

Round 3: LLM → Final JSON response (AdaptiveUISpec or AgentIntent)
         → No more tool calls → proceed to parsing
```

Key constraints:
- Maximum 5 rounds per request
- When tools are registered, `response_format: json_object` is omitted (OpenAI doesn't support both)
- The system prompt instructs JSON output instead
- If final response isn't JSON, adapter retries once with `response_format`

## Intent Resolution

In intent mode, the LLM outputs `AgentIntent` instead of `AdaptiveUISpec`:

```json
{
  "message": "Let's pick your Azure region and compute tier.",
  "ask": [
    { "type": "azure-regions", "key": "region", "label": "Region" },
    { "type": "choice", "key": "tier", "label": "Tier",
      "options": ["Basic", "Standard", "Premium"] }
  ],
  "show": [
    { "type": "alert", "severity": "info",
      "message": "Premium tier includes SLA guarantees." }
  ],
  "next": "User selected region={{state.region}}, tier={{state.tier}}"
}
```

The resolver (`resolveIntent()`) transforms this:

1. **Normalize ask types** — `radioGroup` → `choice`, `input` → `text`, etc.
2. **Resolve each ask**:
   - `choice` with ≤5 options → `radioGroup` component
   - `choice` with >5 options → `select` component
   - `azure-regions` → invokes registered pack intent resolver → `azurePicker` component
   - `text` → `input` component
3. **Resolve each show** — `alert` → `alert` component, `markdown` → `markdown` component
4. **Assemble layout** — show items first, then ask items, auto-add Continue button
5. **Return `AdaptiveUISpec`** — ready for rendering

## History Management

### Spec Summarization

Rather than storing full JSON specs in conversation history (which would bloat the context window), `AdaptiveApp` stores compact summaries:

```
Full spec:  ~3,000 tokens per turn
Summary:    ~100-200 tokens per turn
```

At turn 5, this saves ~14,000 tokens of context window.

### State Change Extraction

When the user advances a turn, the framework extracts meaningful state changes:

```
Before: { region: "", tier: "" }
After:  { region: "eastus", tier: "Standard" }
Summary: "User selected: region=eastus, tier=Standard"
```

This summary replaces the full state snapshot in history.

### Auto-Compaction

When prompt tokens exceed 80k, older turns are compacted more aggressively. The system keeps the most recent turns intact and summarizes older ones.

## Token Budget

| Component | Typical Cost |
|---|---|
| Base system prompt (intent) | ~400 tokens |
| Base system prompt (full-spec) | ~1,200 tokens |
| Compact notation rules | ~400 tokens |
| Pack prompts (Azure + GitHub) | ~2,000 tokens |
| Skills (ARM templates) | ~500-1,000 tokens per topic |
| History (5 turns, summarized) | ~1,000 tokens |
| User message + state | ~200-500 tokens |
| **Total input** | **~4,500-6,000 tokens typical** |
| LLM output (compact) | ~200-800 tokens per response |
| Diagram output | ~300-500 tokens |
| `max_completion_tokens` | 16,384 (default) |

## Error Handling

| Scenario | Behavior |
|---|---|
| Network error | Error shown in UI, user can retry |
| Truncated JSON | Auto-repaired by closing open braces |
| Non-JSON response | Displayed as-is in agent bubble |
| Unknown tool | Returns error string to LLM, loop continues |
| Tool execution failure | Error string returned, LLM can adapt |
| Invalid component type | Inferred from props or shown as placeholder |
| Rate limiting | Error surfaced to user |
