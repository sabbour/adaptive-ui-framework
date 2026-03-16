import type { AdaptiveUISpec } from './schema';
import type { StateStore } from './interpolation';
import { getPackSystemPrompts, resolvePackSkills } from './registry';
import { expandCompact, COMPACT_PROMPT } from './compact';
import { sanitizeSpec } from './sanitize';
import { trackStart, trackEnd } from './request-tracker';

// ─── LLM Adapter ───
// Abstract interface for connecting to any LLM provider.
// The framework ships with an OpenAI-compatible adapter and a mock adapter.

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerateUIResult {
  spec: AdaptiveUISpec;
  usage: TokenUsage;
}

export interface LLMAdapter {
  /** Send a prompt and get back an AdaptiveUISpec with token usage */
  generateUI(
    prompt: string,
    currentState: StateStore,
    conversationHistory: LLMMessage[]
  ): Promise<GenerateUIResult>;
}

// ─── System prompt that teaches the LLM the schema ───
export const ADAPTIVE_UI_SYSTEM_PROMPT = `You are a conversational agent that drives multi-step workflows by asking questions and presenting choices to the user via dynamic UI. You respond ONLY with valid JSON matching the AdaptiveUISpec schema.

Your job is to guide users through complex tasks step-by-step:
1. Understand the user's goal
2. Figure out what information you need
3. Generate a UI with the right questions, choices, and inputs for this step
4. When the user responds, process their answers and generate the NEXT step
5. Continue until the task is complete

Use "agentMessage" to explain what you're doing or asking in natural language. The layout contains the interactive UI elements.

The JSON schema you produce:
{
  "version": "1",
  "title": "Step Title",
  "agentMessage": "Natural language message explaining this step",
  "layout": { /* root AdaptiveNode */ },
  "state": { /* initial state key-values for this step */ },
  "theme": { /* optional theme overrides */ },
  "diagram": "flowchart TD\\n  A --> B"  /* optional Mermaid diagram definition */
}

Available component types:

LAYOUT:
- "container": { children: AdaptiveNode[], style? }
- "card": { title?, subtitle?, children?, onClick? }
- "tabs": { tabs: [{label, id, children}] }

TEXT & MEDIA:
- "text": { content, variant?: "h1"|"h2"|"h3"|"h4"|"body"|"caption"|"code" }
- "markdown": { content: "markdown string" }
- "image": { src, alt? }

INPUTS (use these to collect information):
- "input": { inputType?: "text"|"number"|"email"|"password"|"textarea"|"date", label?, placeholder?, bind: "stateKey" }
- "select": { label?, options: [{label,value}], bind: "stateKey" }
- "radioGroup": { label?, options: [{label, value, description?}], bind: "stateKey" }
- "multiSelect": { label?, options: [{label, value, description?}], bind: "stateKey" }

ACTIONS:
- "button": { label, variant?: "primary"|"secondary"|"danger"|"ghost", onClick: Action, disabled? }
- "form": { children, onSubmit: Action }

DATA:
- "list": { items: "stateKey" | [{...}], itemTemplate: AdaptiveNode }
- "table": { columns: [{key,header,width?}], rows: "stateKey" | [{...}] }

FEEDBACK:
- "progress": { value, max?, label? }
- "alert": { severity: "info"|"success"|"warning"|"error", title?, content }
- "badge": { content, color?: "blue"|"green"|"red"|"yellow"|"gray"|"purple" }
- "divider": { label? } — horizontal separator, optionally labeled

TOGGLE & SLIDER:
- "toggle": { label?, description?, bind: "stateKey" } — on/off switch
- "slider": { label?, min?, max?, step?, bind: "stateKey" } — range slider

CONTENT:
- "accordion": { items: [{label, id, children: AdaptiveNode[]}] } — collapsible sections
- "codeBlock": { code, language? } — syntax-highlighted code with copy button
- "link": { label, href, external? } — clickable link

USER INPUT:
- "chatInput": { placeholder? } — free-text input that sends a prompt

Action types:
- { type: "sendPrompt", prompt: "text with {{state.key}} interpolation" } — advance the conversation
- { type: "setState", state: { key: value } }
- { type: "submit", prompt?: "optional prompt" } — submit form data and advance
- { type: "custom", name: "actionName", payload: {} }

All nodes support: id?, style?, className?, visible? (bool or "{{state.key}}" string), props?
Use {{state.key}} in strings to interpolate state values.
ALWAYS use the full prefix {{state.key}} — NEVER abbreviate to {{st.key}} or any other shorthand. The interpolation engine ONLY recognizes {{state.key}} and {{item.key}}.
NEVER reference keys starting with __ (double underscore) in sendPrompt prompts, agentMessage text, or any user-visible text. Keys like __azureToken, __azureSubscriptions are internal/sensitive and must not be displayed.

IMPORTANT GUIDELINES:
- Each response should focus on ONE step of the workflow
- Use radioGroup for single-choice questions (e.g., "Which cloud provider?")
- Use multiSelect for multi-choice questions (e.g., "Which features do you need?")
- Use input/select for collecting specific values
- When presenting a list for the user to pick a single value, choose the component based on list size:
  - 5 or fewer options → use "radioGroup" (all choices visible at once)
  - 6 or more options → use "select" (compact dropdown, scales to large lists)
  - Do NOT use "table" for selection — tables are for read-only data display only
- Do NOT pre-select or set default values for user-choice fields (select, radioGroup, multiSelect) in the "state" object unless the user has explicitly provided that value. Leave them unset so the user must make an active choice.
- Always include a "Continue" or "Next" button that uses sendPrompt or submit to advance
- Include agentMessage to explain what you're asking and why
- When the workflow is complete, show a summary and confirmation
- Be conversational and helpful in agentMessage text

ESCAPE HATCH / RE-ADAPTATION:
- Users may respond with free text instead of filling the UI controls
- When this happens, parse their text response and adapt the UI accordingly
- ALWAYS preserve any state values from the current collected data (sent as "Current collected data: {...}")
- Pre-fill form fields with previously collected values using the "state" property
- If the user's text answers a question, capture that value and advance to the next step
- If the user asks for a different approach, re-generate the UI but keep any reusable data`;

// ─── Endpoint normalization ───
// Handles various endpoint formats:
// - No endpoint → default OpenAI
// - Azure AI Foundry: https://xxx.services.ai.azure.com/api/projects/xxx
// - Azure OpenAI: https://xxx.openai.azure.com
// - OpenAI-compatible with just base URL
function normalizeEndpoint(endpoint: string | undefined, model?: string): { url: string; isAzure: boolean } {
  if (!endpoint) {
    return { url: 'https://api.openai.com/v1/chat/completions', isAzure: false };
  }

  // Remove trailing slash
  let url = endpoint.replace(/\/+$/, '');

  // Azure AI Foundry: https://xxx.services.ai.azure.com/api/projects/xxx
  if (url.includes('.services.ai.azure.com')) {
    if (!url.includes('/chat/completions')) {
      const deployment = model || 'gpt-4o';
      url = `${url}/openai/deployments/${deployment}/chat/completions?api-version=2024-12-01-preview`;
    }
    return { url, isAzure: true };
  }

  // Azure OpenAI: https://xxx.openai.azure.com
  if (url.includes('.openai.azure.com') || url.includes('.cognitiveservices.azure.com')) {
    if (!url.includes('/chat/completions')) {
      const deployment = model || 'gpt-4o';
      url = `${url}/openai/deployments/${deployment}/chat/completions?api-version=2024-12-01-preview`;
    }
    return { url, isAzure: true };
  }

  // Generic OpenAI-compatible: append /v1/chat/completions if not already a full path
  if (!url.includes('/chat/completions')) {
    // If it looks like a base URL (no path or just /v1), append the path
    const pathPart = new URL(url).pathname;
    if (pathPart === '/' || pathPart === '/v1' || pathPart === '/v1/') {
      url = url.replace(/\/v1\/?$/, '') + '/v1/chat/completions';
    }
  }

  return { url, isAzure: false };
}

// ─── OpenAI-compatible adapter ───

export interface OpenAIAdapterConfig {
  apiKey: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Extra system prompt to append */
  systemPromptSuffix?: string;
  /** Override the default system prompt entirely (pack prompts and suffix are still appended) */
  systemPromptOverride?: string;
}

export class OpenAIAdapter implements LLMAdapter {
  private config: OpenAIAdapterConfig;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
  }

  async generateUI(
    prompt: string,
    currentState: StateStore,
    conversationHistory: LLMMessage[]
  ): Promise<GenerateUIResult> {
    // Resolve knowledge skills from packs based on the user's prompt
    // Returns only newly-fetched skills (not previously cached ones)
    const newSkills = await resolvePackSkills(prompt);

    const packContext = getPackSystemPrompts();
    const basePrompt = this.config.systemPromptOverride || ADAPTIVE_UI_SYSTEM_PROMPT;
    const systemPrompt = basePrompt +
      '\n\n' + COMPACT_PROMPT +
      (packContext ? '\n\n' + packContext : '') +
      (this.config.systemPromptSuffix ? '\n\n' + this.config.systemPromptSuffix : '');

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    // Inject newly-resolved skills as a one-time context message (not in system prompt)
    // This avoids re-sending cached skills on every subsequent turn (~500-1000 tokens saved)
    if (newSkills) {
      messages.push({ role: 'user', content: `[Domain knowledge for this request]\n${newSkills}` });
    }

    messages.push({
      role: 'user',
      content: `Current state: ${JSON.stringify(currentState)}\n\nUser request: ${prompt}`,
    });

    const { url: endpoint, isAzure } = normalizeEndpoint(this.config.endpoint, this.config.model);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isAzure) {
      headers['api-key'] = this.config.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: this.config.model ?? 'gpt-4o',
      messages,
      max_completion_tokens: this.config.maxTokens ?? 4096,
      response_format: { type: 'json_object' },
    };

    // Only include temperature if explicitly set (some models only support default)
    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    const reqId = trackStart('POST', endpoint);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      trackEnd(reqId);
      throw err;
    }

    if (!response.ok) {
      trackEnd(reqId);
      const text = await response.text();
      throw new Error(`LLM API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;

    if (!content) {
      // Provide more diagnostic info about why content is empty
      const reason = choice?.finish_reason ?? 'unknown';
      const refusal = choice?.message?.refusal;
      const filterResult = data.choices?.[0]?.content_filter_results;
      let detail = `finish_reason=${reason}`;
      if (refusal) detail += `, refusal: ${refusal}`;
      if (filterResult) detail += `, content_filter: ${JSON.stringify(filterResult)}`;
      if (!data.choices?.length) detail = `no choices in response (model: ${data.model ?? 'unknown'})`;
      throw new Error(`Empty response from LLM (${detail})`);
    }

    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };

    // Extract JSON from the response — LLMs sometimes wrap it in markdown code blocks
    // or add preamble/postamble text around the JSON object
    let jsonStr = content.trim();

    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // If still not starting with {, try to find the first { ... last }
    if (!jsonStr.startsWith('{')) {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to fix common LLM JSON issues before giving up
      let fixedStr = jsonStr;

      // Remove backticks that the LLM may have embedded in string values
      // e.g. "diagram": "` mermaid\nblock-beta..." → "diagram": " mermaid\nblock-beta..."
      fixedStr = fixedStr.replace(/`/g, '');

      try {
        parsed = JSON.parse(fixedStr);
      } catch {
        // If JSON parse still fails, wrap the raw text as a markdown spec
        console.warn('[AdaptiveUI] LLM returned non-JSON response, wrapping as markdown');
        parsed = {
          agentMessage: content.slice(0, 200),
          layout: { type: 'markdown', content },
        };
      }
    }

    trackEnd(reqId);

    return {
      spec: sanitizeSpec(expandCompact(parsed)) as AdaptiveUISpec,
      usage,
    };
  }
}

// ─── Mock adapter for development/testing ───

export class MockAdapter implements LLMAdapter {
  private responses: Map<string, AdaptiveUISpec> = new Map();
  private defaultResponse: AdaptiveUISpec;
  private delay: number;

  constructor(defaultResponse: AdaptiveUISpec, delay = 500) {
    this.defaultResponse = defaultResponse;
    this.delay = delay;
  }

  /** Register a canned response for a prompt pattern */
  addResponse(pattern: string, spec: AdaptiveUISpec): void {
    this.responses.set(pattern.toLowerCase(), spec);
  }

  async generateUI(
    prompt: string,
    _currentState: StateStore,
    _conversationHistory: LLMMessage[]
  ): Promise<GenerateUIResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delay));

    const lower = prompt.toLowerCase();
    for (const [pattern, spec] of this.responses) {
      if (lower.includes(pattern)) return { spec, usage: { promptTokens: 0, completionTokens: 0 } };
    }

    return { spec: this.defaultResponse, usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
