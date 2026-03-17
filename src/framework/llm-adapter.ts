import type { AdaptiveUISpec } from './schema';
import type { StateStore } from './interpolation';
import { getPackSystemPrompts, resolvePackSkills, getIntentResolverPrompt } from './registry';
import { expandCompact, COMPACT_PROMPT, INTENT_COMPACT_PROMPT } from './compact';
import { sanitizeSpec } from './sanitize';
import { trackStart, trackEnd } from './request-tracker';
import { resolveIntent, isAgentIntent } from './intent-resolver';
import { resetDecisionLog, logDecision, getDecisionLog, type DecisionEntry } from './decision-log';
import { getToolDefinitions, executeTool, type ToolCall } from './tools';

// ─── Truncated JSON repair ───
// When finish_reason=length, the JSON is cut off mid-stream.
// Try to close open braces/brackets to salvage a partial object.
function repairTruncatedJson(str: string): unknown | null {
  // Strip trailing incomplete string values
  let s = str.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
  // Count open vs close braces/brackets
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }
  // Close any open structures
  for (let i = 0; i < brackets; i++) s += ']';
  for (let i = 0; i < braces; i++) s += '}';
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

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
  /** Raw JSON string from the LLM (before expansion/resolution) for debugging */
  rawResponse?: string;
  /** Raw messages array sent to the LLM for debugging */
  rawRequest?: string;
  /** Logical decisions made during parsing/resolution */
  decisionLog?: DecisionEntry[];
}

export interface LLMAdapter {
  /** Send a prompt and get back an AdaptiveUISpec with token usage */
  generateUI(
    prompt: string,
    currentState: StateStore,
    conversationHistory: LLMMessage[]
  ): Promise<GenerateUIResult>;

  /** Summarize old conversation history into a compact context string.
   *  Used by auto-compaction to reduce token usage on long conversations. */
  summarizeHistory?(messages: LLMMessage[]): Promise<string>;
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
- "codeBlock": { code, language?, label? } — syntax-highlighted code block. The "label" should be a filename (e.g., "main.bicep", "deploy.sh"). Auto-saved as a downloadable file.
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
- If the user asks for a different approach, re-generate the UI but keep any reusable data

TOOLS:
- You may have access to tools like fetch_webpage. Use them to look up documentation or API references when you need accurate details (e.g., ARM API body schemas, correct API versions, service quotas).
- Do NOT guess ARM request body structures — if unsure, use fetch_webpage to check the docs first.`;

// ─── Intent-based system prompt (~400 tokens vs ~1,200 for full spec) ───
export const INTENT_SYSTEM_PROMPT = `You are a conversational agent that drives multi-step workflows by asking questions and presenting choices. Respond ONLY with valid JSON.

Output format:
{
  "message": "Natural language explanation of this step",
  "title": "Step Title",
  "ask": [ /* fields to collect */ ],
  "show": [ /* info to display */ ],
  "next": "Prompt template with {{state.key}} sent when user continues",
  "state": { /* initial values */ },
  "diagram": "mermaid block-beta string"
}

ASK types (collect user input):
- { type: "choice", key: "stateKey", label?, options: [{label, value, description?}], multiple?: true }
- { type: "text", key, label?, placeholder? }
- { type: "number", key, label?, placeholder? }
- { type: "email", key, label?, placeholder? }
- { type: "date", key, label? }
- { type: "textarea", key, label?, placeholder? }
- { type: "toggle", key, label?, description? }
- { type: "slider", key, label?, min?, max?, step? }
- { type: "free-text", placeholder? }
- { type: "component", component: "componentName", props?: {} }

SHOW types (display-only information — NO components here):
- { type: "info"|"success"|"warning"|"error", title?, content }
- { type: "markdown", content }
- { type: "table", columns: [{key, header}], rows: [{...}] }
- { type: "progress", value, max?, label? }
- { type: "code", code, language?, label? } — label should be a filename (e.g., "main.bicep")

IMPORTANT RULES:
- Components (azureLogin, azureResourceForm, etc.) go in "ask", NEVER in "show". "show" is only for static display.
- "next" must be a factual summary of user selections using {{state.key}} templates, NOT agent prose.
  GOOD: "User selected region: {{state.region}}, resource group: {{state.rg}}"
  BAD:  "Great, I'll now set up the resources for you."
  BAD:  "After sign-in, we'll pick the subscription."
- If there are no user inputs to summarize (e.g., sign-in step), omit "next" entirely — the framework handles it.

GUIDELINES:
- Each response = ONE step of the workflow
- "message" explains what you're asking/showing and why
- "next" is the prompt template sent when the user clicks Continue — use {{state.key}} to reference collected values. Write it as a factual data summary, not conversational prose.
- ALWAYS use the full prefix {{state.key}} — NEVER abbreviate
- NEVER reference keys starting with __ in message or next — those are internal/sensitive
- Do NOT pre-select or set default values for user-choice fields unless the user explicitly provided them
- Pack components (azureLogin, azureResourceForm, azureQuery, azurePicker) MUST go in "ask" using { type: "component", component: "name" } — NEVER put them in "show"
- Prefer the standard ask types first; they are the most reliable
- If you need a custom control shape, you may emit a component-like ask or raw layout, but include common props such as key/bind, label, options, children, rows/columns, or content so the client can infer a usable fallback
- When the workflow is complete, show a summary (use show type "markdown" or "table") and omit "ask"
- If the user responds with free text instead of using controls, parse their text and adapt accordingly
- ALWAYS preserve previously collected state values
- You may have access to tools (e.g., fetch_webpage). Use them to look up documentation when you need exact API body schemas, versions, or service details. Do NOT guess ARM request bodies.`;

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
  /** Use intent-based mode: LLM outputs semantic intents, client resolves to UI.
   *  Reduces input tokens ~40-50% and output tokens ~60%. Default: false. */
  useIntents?: boolean;
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
    // Start fresh decision log for this request
    resetDecisionLog();

    // Resolve knowledge skills from packs based on the user's prompt
    // Returns only newly-fetched skills (not previously cached ones)
    const newSkills = await resolvePackSkills(prompt);
    if (newSkills) {
      logDecision('adapter', `Fetched domain knowledge from pack skills and injected ${newSkills.length} chars of context into this request`);
    }

    const packContext = getPackSystemPrompts();
    const useIntents = this.config.useIntents ?? false;
    const basePrompt = this.config.systemPromptOverride
      || (useIntents ? INTENT_SYSTEM_PROMPT : ADAPTIVE_UI_SYSTEM_PROMPT);
    const compactPrompt = useIntents ? INTENT_COMPACT_PROMPT : COMPACT_PROMPT;
    const intentTypes = useIntents ? getIntentResolverPrompt() : '';
    const systemPrompt = basePrompt +
      '\n\n' + compactPrompt +
      (intentTypes || '') +
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
      content: `Current state: ${JSON.stringify(
        Object.fromEntries(Object.entries(currentState).filter(([k]) => !k.startsWith('__') && !/password|secret|token|apiKey|credential|connectionString/i.test(k)))
      )}\n\nUser request: ${prompt}`,
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
      max_completion_tokens: this.config.maxTokens ?? 16384,
    };

    // Add tools if registered; when tools are present, use json_schema or omit response_format
    // (OpenAI doesn't support response_format: json_object + tools simultaneously)
    const tools = getToolDefinitions();
    if (tools.length > 0) {
      body.tools = tools;
      // Don't set response_format when tools are available — the system prompt
      // already instructs the LLM to respond with JSON on the final turn
    } else {
      body.response_format = { type: 'json_object' };
    }

    // Only include temperature if explicitly set (some models only support default)
    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    // ─── Tool-call loop ───
    // The LLM may request tool calls before producing the final JSON response.
    // We loop up to MAX_TOOL_ROUNDS, executing tools and feeding results back.
    const MAX_TOOL_ROUNDS = 5;
    let loopMessages = [...messages];
    let content: string | null = null;
    let finishReason = 'unknown';
    const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const reqId = trackStart('POST', endpoint);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, messages: loopMessages }),
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
      trackEnd(reqId);

      const choice = data.choices?.[0];
      finishReason = choice?.finish_reason ?? 'unknown';

      // Accumulate token usage across rounds
      usage.promptTokens += data.usage?.prompt_tokens ?? 0;
      usage.completionTokens += data.usage?.completion_tokens ?? 0;

      // Check for tool calls
      const toolCalls: ToolCall[] | undefined = choice?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        logDecision('adapter', `LLM requested ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.function.name).join(', ')} (round ${round + 1}/${MAX_TOOL_ROUNDS})`);

        // Add assistant message with tool_calls to the conversation
        loopMessages.push(choice.message);

        // Execute each tool and add results
        for (const tc of toolCalls) {
          const result = await executeTool(tc);
          loopMessages.push(result as any);
        }
        continue; // Loop back to the LLM with tool results
      }

      // Normal completion — extract content
      content = choice?.message?.content ?? null;
      break;
    }

    // If tools were used and the final response isn't JSON, retry with response_format enforcement
    if (content && tools.length > 0 && !content.trim().startsWith('{')) {
      logDecision('adapter', 'Response after tool calls was not JSON — retrying with response_format: json_object to force structured output');
      loopMessages.push({ role: 'assistant', content } as any);
      loopMessages.push({ role: 'user', content: 'Please respond with ONLY the JSON object as specified in the system prompt. No prose, no markdown fences, just the raw JSON.' } as any);
      const retryReqId = trackStart('POST', endpoint);
      try {
        const retryRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: body.model,
            messages: loopMessages,
            max_completion_tokens: body.max_completion_tokens,
            response_format: { type: 'json_object' },
            ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
          }),
        });
        trackEnd(retryReqId);
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent) {
            content = retryContent;
            usage.promptTokens += retryData.usage?.prompt_tokens ?? 0;
            usage.completionTokens += retryData.usage?.completion_tokens ?? 0;
            finishReason = retryData.choices?.[0]?.finish_reason ?? finishReason;
          }
        }
      } catch {
        // Fall through to original content
      }
    }

    if (!content) {
      let detail = `finish_reason=${finishReason}`;
      if (finishReason === 'tool_calls') detail = 'LLM only produced tool calls but no final content within the allowed rounds';
      throw new Error(`Empty response from LLM (${detail})`);
    }

    if (finishReason === 'length') {
      logDecision('adapter', 'Response was truncated (finish_reason=length) — output token limit reached. Will attempt to salvage partial JSON.');
    }

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

      // Fix unescaped newlines inside JSON string values.
      // LLMs often emit raw line breaks inside "code":"..." fields
      // (e.g. Bicep templates) instead of \\n escapes.
      fixedStr = fixedStr.replace(
        /"(?:[^"\\]|\\.)*"/g,
        (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      );

      // Remove backticks that the LLM may have embedded in string values
      fixedStr = fixedStr.replace(/`/g, '');

      try {
        parsed = JSON.parse(fixedStr);
        logDecision('adapter', 'Repaired LLM JSON by escaping raw newlines inside string values');
      } catch {
        // If truncated (finish_reason=length), try to repair by closing braces
        if (finishReason === 'length') {
          const repaired = repairTruncatedJson(fixedStr);
          if (repaired) {
            logDecision('adapter', 'Repaired truncated JSON by closing open braces/brackets');
            parsed = repaired;
          } else {
            logDecision('adapter', 'Could not repair truncated JSON — showing raw text in agent bubble');
            parsed = {
              agentMessage: content.slice(0, 2000) + (content.length > 2000 ? '\n\n*[truncated]*' : ''),
              layout: { type: 'chatInput', placeholder: 'Type your response...' },
            };
          }
        } else {
          // If JSON parse still fails, put all content in the agent bubble
          console.warn('[AdaptiveUI] LLM returned non-JSON response, showing in agent bubble');
          logDecision('adapter', 'LLM returned non-JSON text — showing full response in the agent message bubble');
          parsed = {
            agentMessage: content.slice(0, 3000),
            layout: { type: 'chatInput', placeholder: 'Type your response...' },
          };
        }
      }
    }

    const expanded = expandCompact(parsed);
    if (JSON.stringify(expanded) !== JSON.stringify(parsed)) {
      logDecision('adapter', 'LLM used compact shorthand (e.g. "t" for type, "c" for children) — expanded to full property names');
    }

    // If intent mode is active (or the response looks like an intent), resolve it
    let spec: AdaptiveUISpec;
    if (useIntents && isAgentIntent(expanded as Record<string, unknown>)) {
      logDecision('adapter', 'LLM output looks like an intent (has "message" field, no "agentMessage") — routing through intent resolver to build the UI');
      spec = resolveIntent(expanded as any);
    } else {
      logDecision('adapter', useIntents
        ? 'Intent mode is on, but LLM returned a full AdaptiveUISpec instead of an intent — using it as-is'
        : 'Adaptive mode — LLM returned a full UI spec, rendering directly without intent resolution');
      spec = expanded as AdaptiveUISpec;
    }

    logDecision('adapter', 'Sanitized the spec (blocked unsafe URLs, stripped script injection vectors)');

    return {
      spec: sanitizeSpec(spec) as AdaptiveUISpec,
      usage,
      rawResponse: content,
      rawRequest: JSON.stringify(loopMessages, null, 2),
      decisionLog: getDecisionLog(),
    };
  }

  async summarizeHistory(messages: LLMMessage[]): Promise<string> {
    const { url: endpoint, isAzure } = normalizeEndpoint(this.config.endpoint, this.config.model);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isAzure) {
      headers['api-key'] = this.config.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const conversation = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model ?? 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a concise conversation summarizer. Output plain text only — no JSON, no markdown fences.' },
          { role: 'user', content: `Summarize this conversation history into a compact context summary (under 500 words) that preserves:\n- All user requirements and constraints discovered\n- Key decisions made (architecture, services, tech stack)\n- Current project state and what has been completed\n- Pending questions or next steps\n\nConversation:\n${conversation}` },
        ],
        max_completion_tokens: 2048,
      }),
    });

    if (!res.ok) throw new Error(`Summarization failed: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
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
