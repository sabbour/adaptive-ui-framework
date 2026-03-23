import type { AdaptiveUISpec } from './schema';
import type { StateStore } from './interpolation';
import { getPackSystemPrompts, resolvePackSkills } from './registry';
import { expandCompact, COMPACT_PROMPT } from './compact';
import { sanitizeSpec } from './sanitize';
import { trackStart, trackEnd } from './request-tracker';
import { resetDecisionLog, logDecision, getDecisionLog, type DecisionEntry } from './decision-log';
import { getToolDefinitions, executeTool, type ToolCall } from './tools';

// ─── Balanced JSON extraction ───
// Find the first complete top-level JSON object in a string.
// Handles trailing text after the JSON (e.g. LLM prose after the object).
function extractBalancedJson(str: string, startIndex = 0): string | null {
  const start = str.indexOf('{', startIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null; // unbalanced
}

// Try to extract the JSON object that looks like an AdaptiveUISpec.
// Useful when the model returns extra JSON objects (examples, logs, history)
// before the actual spec payload.
function extractLikelySpecJson(str: string): string | null {
  const keyPattern = /"(?:ly|layout)"\s*:/g;
  const starts: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = keyPattern.exec(str)) !== null) {
    const keyIndex = match.index;
    const braceIndex = str.lastIndexOf('{', keyIndex);
    if (braceIndex !== -1) starts.push(braceIndex);
  }

  for (const start of starts) {
    const candidate = extractBalancedJson(str, start);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && ('layout' in parsed || 'ly' in parsed)) {
        return candidate;
      }
    } catch {
      // Keep scanning other candidates.
    }
  }

  return null;
}

// ─── Extra-brace repair ───
// LLMs sometimes emit one extra } or ] mid-stream, especially after long
// string values (e.g. embedded code). This uses the JSON.parse error position
// to locate and remove the spurious character, then retries parsing.
function repairExtraBraces(str: string): unknown | null {
  // Try up to 3 rounds of removing a single extra } or ] at the error position
  let s = str;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(s);
    } catch (e) {
      const msg = (e as Error).message || '';
      // Node/V8: "... at position 1234"
      const posMatch = msg.match(/position\s+(\d+)/);
      if (!posMatch) return null;
      const pos = parseInt(posMatch[1], 10);
      if (pos <= 0 || pos >= s.length) return null;
      const ch = s[pos];
      if (ch !== '}' && ch !== ']') return null;
      // Remove the extra closing character
      s = s.slice(0, pos) + s.slice(pos + 1);
    }
  }
  try { return JSON.parse(s); } catch { return null; }
}

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
export const ADAPTIVE_UI_SYSTEM_PROMPT = `You drive multi-step workflows via dynamic UI. Respond ONLY with valid JSON matching AdaptiveUISpec.

Workflow: understand goal → ask questions → generate UI per step → process answers → next step → repeat until done.

JSON schema:
{ "version":"1", "title":"Step Title", "agentMessage":"Explain this step", "layout":{/*root node*/}, "state":{/*initial values*/}, "theme":{/*optional*/}, "diagram":"flowchart TD\\nA-->B" }

Component types:

LAYOUT: container(children), columns(children,sizes?:["1","2"],gap?), card(title?,subtitle?,children,onClick?), tabs(tabs:[{label,id,children}])
TEXT: text(content,variant?:h1|h2|h3|h4|body|caption|code), markdown(content), image(src,alt?)
INPUT: input(inputType?:text|number|email|password|textarea|date, label?,placeholder?,bind), select(label?,options:[{label,value}],bind), combobox(label?,options:[{label,value}],bind,placeholder?,allowCustom?:true — dropdown with search that also accepts typed custom values), radioGroup(label?,options:[{label,value,description?}],bind), multiSelect(label?,options:[{label,value,description?}],bind)
ACTION: button(label,variant?:primary|secondary|danger|ghost,onClick,disabled?), form(children,onSubmit)
DATA: list(items:"stateKey"|[...],itemTemplate), table(columns:[{key,header,width?}],rows:"stateKey"|[...])
FEEDBACK: progress(value,max?,label?), alert(severity:info|success|warning|error,title?,content), badge(content,color?:blue|green|red|yellow|gray|purple), divider(label?)
TOGGLE: toggle(label?,description?,bind), slider(label?,min?,max?,step?,bind)
CONTENT: accordion(items:[{label,id,children}]), codeBlock(code,language?,label?), link(label,href,external?)
GUIDED: questionnaire(questions:[{question,options?:[{label,value}],bind,freeformPlaceholder?}],onComplete — stepped question cards shown one at a time with radio options + freeform text input, auto-advances, triggers onComplete when done)
USER INPUT: chatInput(placeholder?)

Actions: {type:"sendPrompt",prompt:"text with {{state.key}}"}, {type:"setState",state:{k:v}}, {type:"submit",prompt?}, {type:"custom",name,payload}

All nodes: id?, style?, className?, visible?(bool|"{{state.key}}"), props?

Rules:
- One step per response. Include agentMessage explaining what/why.
- {{state.key}} for interpolation. NEVER use {{st.key}} shorthand.
- NEVER reference __-prefixed keys (sensitive/internal) in any visible text.
- ≤5 options → radioGroup; ≥6 → select or combobox. Use combobox when the user might need to type a value not in the list. Use questionnaire for multi-step intake (2-4 quick questions) where you want clean stepped UX instead of a long form.
- Tables are read-only, not for selection.
- Do NOT pre-select user-choice fields unless user explicitly provided the value.
- Always include Continue/Next button with sendPrompt or submit action.
- Preserve collected state on re-adaptation; pre-fill known values.
- Parse free-text responses; adapt UI keeping reusable data.
- codeBlock label = filename (e.g., "main.bicep"). Auto-saved as downloadable file.
- Use tools (fetch_webpage) for accurate docs; never guess API schemas.
- VALIDATE your JSON before responding: count every { and } (must match), every [ and ] (must match). Code blocks with multi-line strings are especially error-prone — double-check brace counts after long code values.`;

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
  /** Async callback to get a fresh access token (e.g. from Entra ID).
   *  When provided, uses Bearer token auth instead of api-key header,
   *  even for Azure endpoints. The apiKey field is ignored. */
  getAccessToken?: () => Promise<string>;
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
      content: `Current state: ${JSON.stringify(
        Object.fromEntries(Object.entries(currentState).filter(([k]) => !k.startsWith('__') && !/password|secret|token|apiKey|credential|connectionString/i.test(k)))
      )}\n\nUser request: ${prompt}`,
    });

    const { url: endpoint, isAzure } = normalizeEndpoint(this.config.endpoint, this.config.model);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.getAccessToken) {
      // Entra ID / OAuth token — always use Bearer, even for Azure endpoints
      const token = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
    } else if (isAzure) {
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
    // Only strip when the ENTIRE response is wrapped in fences (starts with ```).
    // Do NOT match backtick fences that appear inside JSON string values.
    if (jsonStr.startsWith('```')) {
      const fenceMatch = jsonStr.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }
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
      // Step 1: Try balanced-brace extraction (handles trailing text after JSON)
      const balanced = extractBalancedJson(jsonStr);
      if (balanced && balanced !== jsonStr) {
        try {
          parsed = JSON.parse(balanced);
          logDecision('adapter', 'Extracted balanced JSON object — stripped trailing text after the JSON');
        } catch {
          // continue to newline fix
        }
      }

      // Step 1b: If output includes multiple JSON objects, extract the one that
      // looks like an AdaptiveUISpec (contains layout/ly).
      if (!parsed) {
        const likelySpec = extractLikelySpecJson(jsonStr);
        if (likelySpec && likelySpec !== jsonStr) {
          try {
            parsed = JSON.parse(likelySpec);
            logDecision('adapter', 'Extracted likely AdaptiveUISpec object from mixed JSON output');
          } catch {
            // continue to newline fix
          }
        }
      }

      if (!parsed) {
        // Step 2: Fix unescaped newlines inside JSON string values.
        // LLMs often emit raw line breaks inside "code":"..." fields
        // (e.g. Bicep templates) instead of \\n escapes.
        // The 's' flag makes '.' match newlines so \<newline> is handled by '\\.'.
        let fixedStr = balanced ?? jsonStr;
        fixedStr = fixedStr.replace(
          /"(?:[^"\\]|\\.)*"/gs,
          (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        );

        try {
          parsed = JSON.parse(fixedStr);
          logDecision('adapter', 'Repaired LLM JSON by escaping raw newlines inside string values');
        } catch {
          // Step 3: Try removing extra closing braces/brackets at the error position.
          // LLMs lose track of nesting depth after long embedded strings (code blocks).
          const extraBraceRepaired = repairExtraBraces(fixedStr);
          if (extraBraceRepaired) {
            parsed = extraBraceRepaired;
            logDecision('adapter', 'Repaired LLM JSON by removing extra closing brace(s) — LLM miscounted nesting after long code strings');
          } else if (finishReason === 'length') {
          // Step 4: If truncated (finish_reason=length), try to repair by closing braces
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
    }

    const expanded = expandCompact(parsed);
    if (JSON.stringify(expanded) !== JSON.stringify(parsed)) {
      logDecision('adapter', 'LLM used compact shorthand (e.g. "t" for type, "c" for children) — expanded to full property names');
    }

    logDecision('adapter', 'LLM returned a full UI spec, rendering directly');
    const spec = expanded as AdaptiveUISpec;

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
    if (this.config.getAccessToken) {
      const token = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
    } else if (isAzure) {
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
