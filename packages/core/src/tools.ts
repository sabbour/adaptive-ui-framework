// ─── Tool System ───
// Tools the LLM can call during generation. The adapter handles the
// tool-call loop: LLM requests a tool → adapter executes → sends result back.

import { trackedFetch } from './request-tracker';
import { logDecision } from './decision-log';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const toolHandlers = new Map<string, ToolHandler>();
const toolDefinitions: ToolDefinition[] = [];

/** Register a tool the LLM can call */
export function registerTool(def: ToolDefinition, handler: ToolHandler): void {
  toolDefinitions.push(def);
  toolHandlers.set(def.function.name, handler);
}

/** Clear all registered tools */
export function clearTools(): void {
  toolDefinitions.length = 0;
  toolHandlers.clear();
}

/** Get all registered tool definitions (for the API request) */
export function getToolDefinitions(): ToolDefinition[] {
  return toolDefinitions;
}

/** Execute a tool call and return the result */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const handler = toolHandlers.get(call.function.name);
  if (!handler) {
    logDecision('adapter', `Tool "${call.function.name}" not found — returning error to LLM`);
    return { tool_call_id: call.id, role: 'tool', content: `Unknown tool: ${call.function.name}` };
  }
  try {
    const args = JSON.parse(call.function.arguments);
    logDecision('adapter', `Executing tool "${call.function.name}"${args.url ? ` → ${args.url}` : ''}`);
    const result = await handler(args);
    logDecision('adapter', `Tool "${call.function.name}" returned ${result.length} chars`);
    return { tool_call_id: call.id, role: 'tool', content: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logDecision('adapter', `Tool "${call.function.name}" failed: ${msg}`);
    return { tool_call_id: call.id, role: 'tool', content: `Tool error: ${msg}` };
  }
}

// ═══════════════════════════════════════
// Built-in: fetch_webpage
// ═══════════════════════════════════════
registerTool(
  {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: 'Fetch the text content of a web page or documentation URL. Use to read Azure Learn docs, GitHub pages, API references, or any public URL. Returns plain text or markdown.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  async (args) => {
    const url = String(args.url);

    // ─── SSRF Protection ───
    // Block private/loopback/link-local IPs and non-HTTP protocols
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `Blocked: only http/https URLs are allowed (got ${parsed.protocol})`;
      }
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        hostname === 'metadata.google.internal' ||
        hostname === 'metadata.google.com'
      ) {
        return `Blocked: cannot fetch private/internal URLs (${hostname})`;
      }
    } catch {
      return `Invalid URL: ${url}`;
    }

    const headers: Record<string, string> = {
      Accept: 'text/markdown, text/plain, text/html',
    };

    // For Microsoft Learn docs, request markdown directly
    if (url.includes('learn.microsoft.com')) {
      const separator = url.includes('?') ? '&' : '?';
      const mdUrl = `${url}${separator}from=learn-agent-skill&accept=text/markdown`;
      try {
        const res = await trackedFetch(mdUrl, { headers });
        if (res.ok) {
          let text = await res.text();
          if (text.length > 6000) text = text.slice(0, 6000) + '\n\n[truncated]';
          return text;
        }
      } catch { /* fall through */ }
    }

    const res = await trackedFetch(url, { headers });
    if (!res.ok) return `Failed to fetch ${url}: ${res.status}`;
    let text = await res.text();

    // Strip HTML for readability
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s{2,}/g, ' ').trim();
    if (text.length > 6000) text = text.slice(0, 6000) + '\n\n[truncated]';
    return text;
  }
);
