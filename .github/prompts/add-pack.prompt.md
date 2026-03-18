---
description: "Scaffold a new component pack: directory, createXPack() function, system prompt, components, and registration."
argument-hint: "Pack name and domain, e.g. 'github — GitHub integration with PR review and issue management components'"
agent: "agent"
tools: [read, edit, search, execute]
---

Scaffold a new component pack for the Adaptive UI framework.

Use [src/packs/azure/](../../src/packs/azure/) as the reference implementation.

## Task

Create a new component pack named **$input** with the following files:

### 1. `src/packs/<name>/index.ts`

```typescript
import type { ComponentPack } from '../../framework/registry';
// Import your components, settings, skills resolver, and CSS

const SYSTEM_PROMPT = `
<PACK_NAME> PACK:

COMPONENT:
- "componentName": { prop1, prop2 }
    Description of what this component renders and when the LLM should use it.
`;

export function create<Name>Pack(): ComponentPack {
  return {
    name: '<name>',
    displayName: '<Display Name>',
    components: {
      // componentKey: ComponentFunction,
    },
    systemPrompt: SYSTEM_PROMPT,
    // resolveSkills: resolveSkillsFn,       // optional
    // settingsComponent: SettingsComponent,  // optional
    // tools: [                              // optional — read-only API tools for LLM inference
    //   {
    //     definition: { type: 'function', function: { name: 'tool_name', description: '...', parameters: { ... } } },
    //     handler: async (args) => { /* call API, return string */ },
    //   },
    // ],
  };
}
```

### 2. `src/packs/<name>/components.tsx`

- Define node interfaces extending `AdaptiveNodeBase` with literal `type` fields
- Implement components using `React.createElement()` (no JSX)
- Use `useAdaptive()` for state/dispatch
- Use `trackedFetch()` for external API calls
- Prefix sensitive state keys with `__`

### 3. Register in the demo app

Add to the target demo app (e.g., `src/demo/SolutionArchitectApp.tsx` or `src/demo/TravelApp.tsx`):

```typescript
import { registerPackWithSkills } from '../framework/registry';
import { create<Name>Pack } from '../packs/<name>';

registerPackWithSkills(create<Name>Pack());
```

### 4. Optional: Register tools for LLM inference

If the pack integrates with an API, register **read-only GET tools** so the LLM can query data during inference (before generating the UI). Write operations stay as components with user confirmation.

```typescript
tools: [
  {
    definition: {
      type: 'function',
      function: {
        name: '<pack>_api_get',
        description: 'Call the <service> API (GET only). Use to read data before generating the UI.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'API path' } },
          required: ['path'],
        },
      },
    },
    handler: async (args) => {
      const token = getStoredToken();
      if (!token) return 'Error: User not signed in.';
      const res = await trackedFetch(`https://api.example.com${args.path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return JSON.stringify(data, null, 2).slice(0, 8000);
    },
  },
],
```

Document the tool in the system prompt under a TOOLS section.

### 5. Optional files

- `src/packs/<name>/skills-resolver.ts` — keyword-triggered knowledge fetching
- `src/packs/<name>/css/<name>-theme.css` — custom CSS tokens
- `src/packs/<name>/<Name>Settings.tsx` — settings panel UI

## Constraints

- Follow the `ComponentPack` interface from `src/framework/registry.ts`
- Use `React.createElement()`, not JSX, in components (matches Azure pack style)
- Use `trackedFetch()` from `framework/request-tracker.ts` for API calls
- Prefix internal/secret state keys with `__`
- Document all components in the system prompt so the LLM knows how to use them
- Run `npm run build` to verify compilation

## Verify

Run `npm run build` to confirm TypeScript compilation passes after all files are created.
