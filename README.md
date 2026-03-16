# Adaptive UI Framework

A React framework for building **conversational, agent-driven UIs** powered by LLMs. An AI agent drives a multi-turn conversation — asking questions, presenting forms, choices, and interactive components — dynamically generating the next step based on user responses.

## How It Works

```
User clicks / fills form / types
        │
        ▼
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  AdaptiveApp     │────▶│  LLM + Pack Skills │────▶│  AdaptiveUISpec  │
│  (orchestrator)  │     │  (decides next     │     │  (JSON for this  │
│                  │     │   step + domain    │     │   step)          │
│                  │     │   knowledge)       │     │                  │
└──────────────────┘     └───────────────────┘     └──────────────────┘
        │                                                   │
        ▼                                                   ▼
┌──────────────────┐                              ┌──────────────────┐
│  Conversation    │◀─────────────────────────────│  Component       │
│  Thread          │                              │  Registry        │
│  (turn history)  │                              │  (built-in +     │
│                  │                              │   pack + custom) │
└──────────────────┘                              └──────────────────┘
```

## Quick Start

```bash
npm install
npm run dev
```

The demo starts with a mock adapter (no API key needed). Click the ⚙ gear icon to connect your OpenAI-compatible LLM endpoint.

## Core Concepts

### Conversation Turns

Each interaction is a **turn**: the user's action + the agent's response. Past turns are collapsed; the latest turn is interactive.

### AdaptiveUISpec

JSON the LLM produces for each turn:

```json
{
  "version": "1",
  "title": "Step Title",
  "agentMessage": "What the agent says in natural language",
  "layout": { "type": "container", "children": [...] },
  "state": { "selectedOption": "" },
  "theme": { "primaryColor": "#2563eb" }
}
```

### Component Registry

Maps `type` strings to React components. Ships with **24 built-in components**. Register your own or install packs.

### Component Packs

Bundles of components + LLM knowledge + settings UI that extend the framework:

```typescript
import { registerPackWithSkills } from './framework/registry';
import { createAzurePack } from './packs/azure';

registerPackWithSkills(createAzurePack());
```

A pack can provide:
- **Components** — custom UI types the LLM can use
- **System prompt** — teaches the LLM about the pack's capabilities
- **Knowledge skills** — fetched on demand based on conversation context
- **Settings UI** — injected into the settings panel automatically

## Minimal App

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdaptiveApp, OpenAIAdapter } from './framework';

const adapter = new OpenAIAdapter({
  apiKey: 'sk-...',
  model: 'gpt-4o',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AdaptiveApp adapter={adapter} />
);
```

That's it. The agent will show a chat input and start the conversation.

## Built-in Components (24)

### Layout
| Type | Props | Description |
|------|-------|-------------|
| `container` | `children` | Layout wrapper, supports flex/grid via `style` |
| `card` | `title`, `subtitle`, `children`, `onClick` | Clickable card sections |
| `tabs` | `tabs: [{label, id, children}]` | Tabbed content |
| `divider` | `label?` | Horizontal separator, optionally labeled |
| `accordion` | `items: [{label, id, children}]` | Collapsible sections |

### Text & Media
| Type | Props | Description |
|------|-------|-------------|
| `text` | `content`, `variant` | Headings, body, caption, code |
| `markdown` | `content` | Rich markdown text |
| `image` | `src`, `alt` | Images |
| `codeBlock` | `code`, `language?` | Syntax-highlighted code with copy button |
| `link` | `label`, `href`, `external?` | Clickable links |
| `badge` | `content`, `color` | Colored status tags |

### Inputs
| Type | Props | Description |
|------|-------|-------------|
| `input` | `bind`, `inputType`, `label`, `placeholder` | Text, number, email, textarea, date |
| `select` | `bind`, `options`, `label` | Dropdown |
| `radioGroup` | `bind`, `options` (with descriptions) | Single choice cards |
| `multiSelect` | `bind`, `options` (with descriptions) | Multi-choice checkboxes |
| `toggle` | `bind`, `label`, `description` | On/off switch |
| `slider` | `bind`, `min`, `max`, `step`, `label` | Range slider |
| `chatInput` | `placeholder` | Free-text prompt input |

### Actions & Data
| Type | Props | Description |
|------|-------|-------------|
| `button` | `label`, `variant`, `onClick`, `disabled` | Action buttons |
| `form` | `children`, `onSubmit` | Form submission wrapper |
| `list` | `items`, `itemTemplate` | Dynamic lists |
| `table` | `columns`, `rows` | Data tables |
| `progress` | `value`, `max`, `label` | Progress bars |
| `alert` | `severity`, `title`, `content` | Info/success/warning/error messages |

## Actions

```json
{ "type": "sendPrompt", "prompt": "User selected {{state.option}}" }
{ "type": "setState", "state": { "count": 5 } }
{ "type": "submit", "prompt": "Form data: {{state.email}}" }
{ "type": "custom", "name": "deploy", "payload": { "target": "prod" } }
```

## State & Interpolation

Use `{{state.key}}` in any string to interpolate state values. In lists, use `{{item.key}}`.

## LLM Configuration

The ⚙ settings panel supports any OpenAI-compatible endpoint:
- **OpenAI** — leave endpoint blank
- **Azure OpenAI** — `https://your-resource.openai.azure.com/openai/v1/chat/completions`
- **Azure AI Foundry** — `https://your-resource.services.ai.azure.com/api/projects/your-project`
- **Ollama / LM Studio** — `http://localhost:11434/v1/chat/completions`

Settings persist in `localStorage`. Auto-connects on reload if configured.

## Component Packs

### Creating a Pack

```typescript
import type { ComponentPack } from './framework/registry';

const myPack: ComponentPack = {
  name: 'my-pack',
  displayName: 'My Pack',
  components: { myWidget: MyWidgetComponent },
  systemPrompt: '- "myWidget": { bind, someProp } — Description...',
  resolveSkills: async (prompt) => { /* fetch domain knowledge */ },
  settingsComponent: MyPackSettings,
};
```

### Azure Pack (included)

The Azure pack (`src/packs/azure/`) demonstrates all pack features:

- **`azureLogin`** — inline sign-in card (MSAL popup → ARM token)
- **`azureResourceForm`** — dynamically generates forms from ARM resource provider metadata
- **Knowledge skills** — fetches Azure docs from the [agent-skills catalog](https://github.com/MicrosoftDocs/agent-skills)
- **Settings UI** — sign-in/sign-out injected into the settings panel

No hardcoded schemas — everything discovered from ARM APIs at runtime.

## Crash Recovery

Conversation turns persist to `localStorage` with a 24-hour TTL:

```tsx
<AdaptiveApp adapter={adapter} persistKey="my-session" />
```

## Project Structure

```
src/
├── framework/                     # Reusable framework
│   ├── index.ts                   # Public API
│   ├── schema.ts                  # Types
│   ├── registry.ts                # Component registry + ComponentPack
│   ├── renderer.tsx               # Recursive node renderer
│   ├── context.tsx                # React context, state, actions
│   ├── interpolation.ts           # {{state.key}} resolution
│   ├── llm-adapter.ts             # OpenAI adapter + system prompt
│   ├── AdaptiveApp.tsx            # Conversation orchestrator
│   └── components/
│       ├── builtins.tsx            # 24 built-in components
│       └── ConversationThread.tsx  # Memoized turn thread
├── packs/azure/                   # Azure component pack
└── demo/                          # Demo app
```

## Extending

1. **Custom components** — `registerComponent('chart', ChartComponent)`
2. **Component packs** — Bundle components + LLM context + settings
3. **Custom LLM adapter** — Implement `LLMAdapter` interface
4. **Custom actions** — `onCustomAction` prop on `AdaptiveApp`
5. **Theming** — `theme` prop or per-spec
6. **State access** — `useAdaptive()` hook in custom components

