import React, { useCallback, useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import type { AdaptiveUISpec, AdaptiveTheme, ConversationTurn } from './schema';
import type { StateStore } from './interpolation';
import type { LLMAdapter, LLMMessage } from './llm-adapter';
import { OpenAIAdapter } from './llm-adapter';
import { AdaptiveProvider, useAdaptive } from './context';
import { ConversationThread } from './components/ConversationThread';
import { registerBuiltinComponents } from './components/builtins';
import { getPackSettingsComponents } from './registry';
import { getActiveRequests, subscribe as subscribeRequests } from './request-tracker';
import { logDecision } from './decision-log';
import type { DecisionEntry } from './decision-log';

// Icons
import iconGear from './icons/commands/gear.svg?url';
import iconConnect from './icons/commands/connect.svg?url';
import iconDisconnect from './icons/commands/disconnect.svg?url';
import iconCommentLightning from './icons/fluent/comment-lightning.svg?url';
import iconArrowReset from './icons/fluent/arrow-reset.svg?url';

// Register built-in components on import
registerBuiltinComponents();

// ─── Spec summarization for history ───
// Instead of storing the full JSON spec in conversation history (~2-6KB per turn),
// we store a compact summary (~200-400 chars). This saves ~3000-5000 tokens at turn 5+.

function collectComponentTypes(node: any): string[] {
  if (!node) return [];
  const types: string[] = [];
  if (node.type) types.push(node.type);
  if (node.children) {
    for (const child of node.children) {
      types.push(...collectComponentTypes(child));
    }
  }
  if (node.tabs) {
    for (const tab of node.tabs) {
      if (tab.children) {
        for (const child of tab.children) {
          types.push(...collectComponentTypes(child));
        }
      }
    }
  }
  if (node.items && Array.isArray(node.items)) {
    for (const item of node.items) {
      if (item.children) {
        for (const child of item.children) {
          types.push(...collectComponentTypes(child));
        }
      }
    }
  }
  if (node.itemTemplate) types.push(...collectComponentTypes(node.itemTemplate));
  return types;
}

function summarizeSpec(spec: AdaptiveUISpec): string {
  const parts: string[] = [];
  if (spec.title) parts.push(`Title: ${spec.title}`);
  if (spec.agentMessage) parts.push(`Agent said: ${spec.agentMessage.slice(0, 200)}`);
  const componentTypes = [...new Set(collectComponentTypes(spec.layout))];
  if (componentTypes.length > 0) parts.push(`UI shown: ${componentTypes.join(', ')}`);
  if (spec.state && Object.keys(spec.state).length > 0) {
    const safeState = Object.fromEntries(
      Object.entries(spec.state).filter(([k]) => !k.startsWith('__'))
    );
    if (Object.keys(safeState).length > 0) parts.push(`State keys: ${Object.keys(safeState).join(', ')}`);
  }
  if (spec.diagram) parts.push('(includes architecture diagram)');
  return parts.join('\n');
}

function summarizeUserSelections(currentState: StateStore): string | null {
  const SENSITIVE_RE = /password|secret|token|apiKey|credential|connectionString/i;
  const displayLabels = new Map<string, string>();

  for (const [key, value] of Object.entries(currentState)) {
    if (value === '' || value === null || value === undefined) continue;
    const match = key.match(/^(.*?)(Name|Label|Title|DisplayName)$/);
    if (!match) continue;
    const baseKey = match[1];
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (text) displayLabels.set(baseKey, text);
  }

  const parts = Object.entries(currentState)
    .filter(([key, value]) => value !== '' && value !== null && value !== undefined)
    .filter(([key]) => !key.startsWith('__'))
    .filter(([key]) => !SENSITIVE_RE.test(key))
    .filter(([key]) => !/(Name|Label|Title|DisplayName)$/.test(key))
    .map(([key, value]) => {
      const displayValue = displayLabels.get(key)
        ?? (typeof value === 'string' ? value.trim() : String(value));
      if (!displayValue) return null;
      if (displayValue.length > 200) return null;
      return `${key}: ${displayValue}`;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? `Selected ${parts.join(', ')}` : null;
}

// ─── LLM Config persistence ───
function loadLLMConfig(): { endpoint: string; apiKey: string; model: string } {
  try {
    const raw = localStorage.getItem('adaptive-ui-config');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { endpoint: '', apiKey: '', model: 'gpt-4o' };
}

function saveLLMConfig(config: { endpoint: string; apiKey: string; model: string }) {
  localStorage.setItem('adaptive-ui-config', JSON.stringify(config));
}

// ─── Settings Panel ───
// Built into the framework. Renders LLM config + pack settings + app settings.

function SettingsPanel({
  isConnected,
  onConnect,
  onDisconnect,
  appSettingsComponents,
  visiblePacks,
}: {
  isConnected: boolean;
  onConnect: (config: { endpoint: string; apiKey: string; model: string }) => void;
  onDisconnect: () => void;
  appSettingsComponents?: React.ComponentType[];
  visiblePacks?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(loadLLMConfig);
  const allPackSettings = getPackSettingsComponents();
  const packSettingsList = visiblePacks
    ? allPackSettings.filter(p => visiblePacks.includes(p.name))
    : [];

  const handleConnect = () => {
    saveLLMConfig(config);
    onConnect(config);
  };

  return React.createElement('div', {
    style: { position: 'fixed', top: '6px', right: '12px', zIndex: 1001 },
  },
    open && React.createElement('div', {
      onClick: () => setOpen(false),
      style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
    }),

    React.createElement('button', {
      onClick: () => setOpen((o) => !o),
      style: {
        width: '28px', height: '28px', borderRadius: '50%',
        border: 'none', cursor: 'pointer',
        backgroundColor: isConnected ? 'var(--adaptive-primary)' : 'var(--adaptive-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--adaptive-shadow-md)',
        padding: 0,
      },
      title: isConnected ? 'Settings (Connected)' : 'Settings',
    },
      React.createElement('img', {
        src: iconGear,
        alt: '', width: 14, height: 14,
        style: { filter: isConnected ? 'brightness(0) invert(1)' : 'none' },
      })
    ),

    open && React.createElement('div', {
      className: 'adaptive-settings-panel',
      style: {
        position: 'absolute', top: '36px', right: '0',
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: { fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      },
        'LLM Configuration',
        isConnected && React.createElement('span', {
          style: { fontSize: '11px', color: 'var(--adaptive-primary)', fontWeight: 500 },
        }, '● Connected')
      ),

      React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' } }, 'Endpoint'),
      React.createElement('input', {
        type: 'text', value: config.endpoint,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, endpoint: e.target.value })),
        placeholder: 'https://api.openai.com/v1/chat/completions',
        disabled: isConnected,
        style: { marginBottom: '10px' },
      }),

      React.createElement('label', null, 'API Key'),
      React.createElement('input', {
        type: 'password', value: config.apiKey,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, apiKey: e.target.value })),
        placeholder: 'sk-...', disabled: isConnected,
        style: { marginBottom: '10px' },
      }),

      React.createElement('label', null, 'Model'),
      React.createElement('input', {
        type: 'text', value: config.model,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, model: e.target.value })),
        placeholder: 'gpt-4o', disabled: isConnected,
        style: { marginBottom: '14px' },
      }),

      React.createElement('button', {
        onClick: isConnected ? onDisconnect : handleConnect,
        disabled: !isConnected && !config.apiKey.trim(),
        style: {
          width: '100%', padding: '8px', borderRadius: 'var(--adaptive-radius)', border: 'none',
          fontSize: '14px', fontWeight: 500, cursor: 'pointer',
          backgroundColor: isConnected ? 'var(--adaptive-surface)' : 'var(--adaptive-primary)',
          color: isConnected ? 'var(--adaptive-text)' : '#fff',
          boxShadow: isConnected ? 'inset 0 0 0 1px var(--adaptive-border)' : 'none',
        },
      }, isConnected ? 'Disconnect' : 'Connect'),

      !isConnected && React.createElement('p', {
        style: { fontSize: '12px', color: 'var(--adaptive-text-secondary)', margin: '10px 0 0', lineHeight: 1.4 },
      }, 'Works with any OpenAI-compatible API. Leave endpoint blank for default OpenAI.'),

      // Pack settings
      ...packSettingsList.map((pack) =>
        React.createElement('div', {
          key: pack.name,
          className: 'adaptive-settings-section',
        }, React.createElement(pack.component))
      ),

      // App settings
      ...(appSettingsComponents ?? []).map((Comp, i) =>
        React.createElement('div', {
          key: `app-settings-${i}`,
          className: 'adaptive-settings-section',
        }, React.createElement(Comp))
      )
    )
  );
}

function ShellActivityIndicator() {
  const activeRequests = useSyncExternalStore(subscribeRequests, getActiveRequests);
  const [log, setLog] = useState<Array<{ id: number; method: string; url: string; done: boolean; time: number }>>([]);
  const prevActiveRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const currentIds = new Set(activeRequests.map(r => r.id));
    const prevIds = prevActiveRef.current;

    // Add new requests
    for (const req of activeRequests) {
      if (!prevIds.has(req.id)) {
        setLog(prev => [...prev, { id: req.id, method: req.method, url: req.url, done: false, time: Date.now() }]);
      }
    }

    // Mark completed
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        setLog(prev => prev.map(e => e.id === id ? { ...e, done: true, time: Date.now() } : e));
      }
    }

    prevActiveRef.current = currentIds;
  }, [activeRequests]);

  // Clean up old entries after fade
  useEffect(() => {
    const timer = setInterval(() => {
      setLog(prev => prev.filter(e => !e.done || Date.now() - e.time < 3000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (log.length === 0) return null;

  return React.createElement('div', {
    style: {
      position: 'fixed',
      bottom: '12px',
      left: '260px',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
      fontSize: '10px',
      fontFamily: 'Consolas, "Courier New", monospace',
      color: 'var(--adaptive-text-secondary, #6b7280)',
      maxWidth: '40vw',
      pointerEvents: 'none' as const,
      alignItems: 'flex-start' as const,
    } as React.CSSProperties,
  },
    ...log.slice(-8).map(entry =>
      React.createElement('div', {
        key: entry.id,
        style: {
          padding: '2px 8px',
          borderRadius: '4px',
          backgroundColor: entry.done ? 'rgba(220, 252, 231, 0.9)' : 'rgba(255, 255, 255, 0.92)',
          border: `1px solid ${entry.done ? '#bbf7d0' : '#e5e7eb'}`,
          color: entry.done ? '#166534' : '#6b7280',
          opacity: entry.done ? Math.max(0, 1 - (Date.now() - entry.time) / 3000) : 1,
          transition: 'opacity 2s ease-out',
          whiteSpace: 'nowrap' as const,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        } as React.CSSProperties,
      },
        React.createElement('span', {
          style: {
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            backgroundColor: entry.done ? '#22c55e' : '#F59E0B',
            animation: entry.done ? 'none' : 'adaptive-pulse 1s ease-in-out infinite',
          } as React.CSSProperties,
        }),
        `${entry.method} ${entry.url}`
      )
    )
  );
}

// ─── AdaptiveApp ───
// Conversational agent UI with built-in settings panel.
// Manages its own LLM adapter — apps just provide initialSpec and theme.

export interface AdaptiveAppProps {
  /** Provide a pre-configured adapter (skips built-in settings panel LLM config) */
  adapter?: LLMAdapter;

  /** Initial UI spec (the first thing the agent shows) */
  initialSpec?: AdaptiveUISpec;

  /** Initial state */
  initialState?: StateStore;

  /** Theme overrides */
  theme?: AdaptiveTheme;

  /** Max conversation history to send to LLM */
  maxHistory?: number;

  /** Handler for custom actions */
  onCustomAction?: (name: string, payload: Record<string, unknown> | undefined, state: StateStore) => void;

  /** Called when a new spec is received from the LLM */
  onSpecChange?: (spec: AdaptiveUISpec) => void;

  /** Called on LLM errors */
  onError?: (error: Error) => void;

  /** Key for localStorage persistence. Set to enable crash recovery. */
  persistKey?: string;

  /** Override the system prompt entirely (replaces the default ADAPTIVE_UI_SYSTEM_PROMPT) */
  systemPromptOverride?: string;

  /** Additional context appended after the base system prompt (keeps component docs intact) */
  systemPromptSuffix?: string;

  /** Additional settings components to inject into the settings panel */
  settingsComponents?: React.ComponentType[];

  /** Wrapper class name */
  className?: string;

  /** Wrapper style */
  style?: React.CSSProperties;

  /** Use intent-based mode for token-efficient LLM communication */
  useIntents?: boolean;

  /** Ref callback that receives the sendPrompt function, allowing external components to trigger prompts */
  sendPromptRef?: React.MutableRefObject<((prompt: string) => void) | null>;

  /** Restrict which pack settings appear in the settings panel. Defaults to none — explicitly list pack names to show. */
  visiblePacks?: string[];
}

let turnCounter = Date.now();

export function AdaptiveApp({
  adapter: externalAdapter,
  initialSpec,
  initialState = {},
  theme = {},
  maxHistory = 20,
  onCustomAction,
  onSpecChange,
  onError,
  persistKey,
  systemPromptOverride,
  systemPromptSuffix,
  settingsComponents,
  className,
  style,
  useIntents,
  sendPromptRef,
  visiblePacks,
}: AdaptiveAppProps) {
  // ─── Internal adapter management ───
  const [isConnected, setIsConnected] = useState(() => {
    if (externalAdapter) return true;
    return !!loadLLMConfig().apiKey.trim();
  });
  const [adapterKey, setAdapterKey] = useState(0);
  const [intentMode, setIntentMode] = useState(() => {
    if (useIntents !== undefined) return useIntents;
    try {
      return localStorage.getItem('adaptive-ui-intent-mode') === 'true';
    } catch { return false; }
  });

  const handleToggleIntentMode = useCallback(() => {
    setIntentMode(prev => {
      const next = !prev;
      try { localStorage.setItem('adaptive-ui-intent-mode', String(next)); } catch {}
      return next;
    });
    setAdapterKey(k => k + 1);
  }, []);

  const adapter: LLMAdapter | null = useMemo(() => {
    if (externalAdapter) return externalAdapter;
    if (!isConnected) return null;
    const config = loadLLMConfig();
    return new OpenAIAdapter({
      apiKey: config.apiKey,
      endpoint: config.endpoint || undefined,
      model: config.model || 'gpt-4o',
      systemPromptOverride,
      systemPromptSuffix,
      useIntents: intentMode,
    });
  }, [externalAdapter, isConnected, adapterKey, systemPromptOverride, systemPromptSuffix, intentMode]);

  const handleConnect = useCallback((config: { endpoint: string; apiKey: string; model: string }) => {
    saveLLMConfig(config);
    setIsConnected(true);
    setAdapterKey((k) => k + 1);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setAdapterKey((k) => k + 1);
    if (persistKey) {
      localStorage.removeItem(`adaptive-ui-turns-${persistKey}`);
    }
  }, [persistKey]);

  // Conversation turns — restore from localStorage if available
  const [turns, setTurns] = useState<ConversationTurn[]>(() => {
    if (persistKey) {
      try {
        const raw = localStorage.getItem(`adaptive-ui-turns-${persistKey}`);
        if (raw) {
          const { turns: savedTurns, timestamp } = JSON.parse(raw);
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000 && savedTurns?.length > 0) {
            return savedTurns;
          }
          localStorage.removeItem(`adaptive-ui-turns-${persistKey}`);
        }
      } catch { /* ignore corrupt data */ }
    }
    if (initialSpec) {
      return [{
        id: `turn-${++turnCounter}`,
        agentSpec: initialSpec,
        timestamp: Date.now(),
      }];
    }
    return [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState({ promptTokens: 0, completionTokens: 0 });
  const [lastRequestUsage, setLastRequestUsage] = useState({ promptTokens: 0, completionTokens: 0 });
  const lastPromptTokensRef = useRef(0); // Track actual prompt tokens for compaction trigger
  const [lastRawResponse, setLastRawResponse] = useState<string | null>(null);
  const [lastRawRequest, setLastRawRequest] = useState<string | null>(null);
  const [lastDecisionLog, setLastDecisionLog] = useState<DecisionEntry[]>([]);
  const historyRef = useRef<LLMMessage[]>([]);
  const busyRef = useRef(false);

  // Persist turns to localStorage on change
  useEffect(() => {
    if (persistKey && turns.length > 0) {
      try {
        localStorage.setItem(
          `adaptive-ui-turns-${persistKey}`,
          JSON.stringify({ turns, timestamp: Date.now() })
        );
      } catch { /* storage full, ignore */ }
    }
  }, [turns, persistKey]);

  // Reset the conversation session
  const handleResetSession = useCallback(() => {
    historyRef.current = [];
    busyRef.current = false;
    setIsLoading(false);
    setError(null);
    setTokenUsage({ promptTokens: 0, completionTokens: 0 });
    setLastRequestUsage({ promptTokens: 0, completionTokens: 0 });
    if (persistKey) {
      localStorage.removeItem(`adaptive-ui-turns-${persistKey}`);
    }
    // Clear diagram from session storage
    try { sessionStorage.removeItem('adaptive-ui-diagram'); } catch {}
    if (initialSpec) {
      setTurns([{
        id: `turn-${++turnCounter}`,
        agentSpec: initialSpec,
        timestamp: Date.now(),
      }]);
      onSpecChange?.(initialSpec);
    } else {
      setTurns([]);
    }
  }, [persistKey, initialSpec, onSpecChange]);

  // The current (latest) spec for the provider
  const currentSpec = turns.length > 0 ? turns[turns.length - 1].agentSpec : null;

  const handleSendPrompt = useCallback(
    async (prompt: string, currentState: StateStore, userDisplayText?: string | null) => {
      if (busyRef.current || !adapter) return;
      busyRef.current = true;

      try {
        setIsLoading(true);
        setError(null);
        setLastRawResponse(null);

        // Show request preview in debug panel immediately
        const safeStatePreview = Object.fromEntries(
          Object.entries(currentState).filter(([k]) => !k.startsWith('__'))
        );
        setLastRawRequest(JSON.stringify([
          ...historyRef.current,
          { role: 'user', content: `Current state: ${JSON.stringify(safeStatePreview)}\n\nUser request: ${prompt}` },
        ], null, 2));

        // Capture user data from state for the current turn summary
        const userData = { ...currentState };

        // Update the last turn with user data
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastTurn = { ...updated[updated.length - 1] };
          // userDisplayText === string → user typed this, show it
          // userDisplayText === null → system-generated prompt, derive display from state
          // userDisplayText === undefined → legacy path, use prompt as display
          if (userDisplayText === null) {
            lastTurn.userMessage = summarizeUserSelections(currentState) || 'Continued';
          } else {
            lastTurn.userMessage = userDisplayText ?? prompt;
          }
          lastTurn.userData = userData;
          updated[updated.length - 1] = lastTurn;
          return updated;
        });

        // Build conversation context with the state data (exclude internal/sensitive keys)
        const safeState = Object.fromEntries(
          Object.entries(currentState).filter(([k]) => !k.startsWith('__'))
        );
        const contextPrompt = `User responded: "${prompt}"\nCurrent collected data: ${JSON.stringify(safeState)}`;
        historyRef.current.push({ role: 'user', content: contextPrompt });

        // Trim history (basic cap before the call)
        if (historyRef.current.length > maxHistory) {
          historyRef.current = historyRef.current.slice(-maxHistory);
        }

        // ─── Pre-call context compaction ───
        // Use actual prompt tokens from the previous LLM call to decide when to compact.
        // Triggers when >100k tokens were used, indicating the context is getting large.
        // Falls back to char-based estimation for the first call.
        const COMPACT_THRESHOLD = 100000; // Compact when previous call used >100k prompt tokens
        const KEEP_RECENT = 6; // Keep last 6 messages verbatim for recency

        const prevPromptTokens = lastPromptTokensRef.current;
        // Also estimate from chars for first-call safety (~3 chars per token is more accurate)
        const historyCharCount = historyRef.current.reduce((sum, m) => sum + m.content.length, 0);
        const estimatedTokens = Math.ceil(historyCharCount / 3);
        const shouldCompact = (prevPromptTokens > COMPACT_THRESHOLD) ||
          (prevPromptTokens === 0 && estimatedTokens > COMPACT_THRESHOLD);

        if (historyRef.current.length > KEEP_RECENT && shouldCompact) {
          const oldEntries = historyRef.current.slice(0, -KEEP_RECENT);
          const recentEntries = historyRef.current.slice(-KEEP_RECENT);

          try {
            if (adapter.summarizeHistory) {
              const summaryText = await adapter.summarizeHistory(oldEntries);
              if (summaryText.length > 50) {
                historyRef.current = [
                  { role: 'user', content: `[Conversation summary — ${oldEntries.length} earlier messages compacted]\n${summaryText}` },
                  ...recentEntries,
                ];
                logDecision('compaction', `Summarized ${oldEntries.length} old messages (prev request: ${prevPromptTokens.toLocaleString()} prompt tokens) into ${summaryText.length} char summary. Kept ${KEEP_RECENT} recent messages.`);
              }
            } else {
              // Adapter doesn't support summarization — basic truncation fallback
              const summary = oldEntries.map(e => e.content.slice(0, 150)).join('\n');
              historyRef.current = [
                { role: 'user', content: `[Conversation summary of ${oldEntries.length} earlier messages]\n${summary}` },
                ...recentEntries,
              ];
            }
          } catch {
            // Fallback: simple truncation if summarization fails
            const summary = oldEntries.map(e => e.content.slice(0, 150)).join('\n');
            historyRef.current = [
              { role: 'user', content: `[Conversation summary of ${oldEntries.length} earlier messages]\n${summary}` },
              ...recentEntries,
            ];
          }
        }

        const result = await adapter.generateUI(prompt, currentState, historyRef.current);

        // Store raw response for debug panel
        if (result.rawResponse) {
          setLastRawResponse(result.rawResponse);
        }
        // Update request with full actual request (includes system prompt)
        if (result.rawRequest) {
          setLastRawRequest(result.rawRequest);
        }
        // Store decision log
        if (result.decisionLog) {
          setLastDecisionLog(result.decisionLog);
        }

        // Summarize the spec for history instead of storing full JSON (~80% smaller)
        historyRef.current.push({
          role: 'assistant',
          content: summarizeSpec(result.spec),
        });

        // Track token usage (per-request and cumulative)
        const requestUsage = {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        };
        setLastRequestUsage(requestUsage);
        lastPromptTokensRef.current = requestUsage.promptTokens;
        setTokenUsage(prev => ({
          promptTokens: prev.promptTokens + requestUsage.promptTokens,
          completionTokens: prev.completionTokens + requestUsage.completionTokens,
        }));

        // Add new turn
        const newTurn: ConversationTurn = {
          id: `turn-${++turnCounter}`,
          agentSpec: result.spec,
          timestamp: Date.now(),
        };

        setTurns(prev => [...prev, newTurn]);
        onSpecChange?.(result.spec);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        onError?.(error);
      } finally {
        busyRef.current = false;
        setIsLoading(false);
      }
    },
    [adapter, maxHistory, onSpecChange, onError]
  );

  // Expose sendPrompt to external components via ref
  // The actual state-aware sendPrompt is set by AdaptiveProvider (see below)
  const externalSendPromptRef = sendPromptRef;

  const themeVars: React.CSSProperties & Record<string, string> = {
    '--adaptive-primary': theme.primaryColor ?? currentSpec?.theme?.primaryColor ?? '#2563eb',
    '--adaptive-bg': theme.backgroundColor ?? currentSpec?.theme?.backgroundColor ?? '#f5f5f5',
    '--adaptive-surface': theme.surfaceColor ?? currentSpec?.theme?.surfaceColor ?? '#ffffff',
    '--adaptive-text': theme.textColor ?? currentSpec?.theme?.textColor ?? '#111827',
    '--adaptive-radius': theme.borderRadius ?? currentSpec?.theme?.borderRadius ?? '8px',
    '--adaptive-font': theme.fontFamily ?? currentSpec?.theme?.fontFamily ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  } as any;

  return React.createElement('div', {
    className,
    style: {
      fontFamily: 'var(--adaptive-font)',
      color: 'var(--adaptive-text)',
      backgroundColor: 'var(--adaptive-bg)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...themeVars,
      ...style,
    } as React.CSSProperties,
  },
    React.createElement(ShellActivityIndicator),

    // Settings panel (always present unless external adapter provided)
    !externalAdapter && React.createElement(SettingsPanel, {
      isConnected,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      appSettingsComponents: settingsComponents,
      visiblePacks,
    }),

    // Main content
    adapter
      ? React.createElement(AdaptiveProvider, {
          initialSpec: currentSpec,
          initialState,
          onSendPrompt: handleSendPrompt,
          onCustomAction,
          onResetSession: handleResetSession,
          theme,
        },
          React.createElement(AdaptiveAppInner, { turns, isLoading, error, tokenUsage, lastRequestUsage, useIntents: intentMode, onToggleIntentMode: handleToggleIntentMode, lastRawResponse, lastRawRequest, lastDecisionLog, sendPromptRef: externalSendPromptRef })
        )
      : React.createElement('div', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1, color: 'var(--adaptive-text-secondary)', fontSize: '15px',
            fontFamily: 'var(--adaptive-font)',
          },
        },
          React.createElement('div', { style: { textAlign: 'center' as const } },
            React.createElement('img', {
              src: iconCommentLightning, alt: '',
              style: { width: '48px', height: '48px', marginBottom: '16px', opacity: 0.6 },
            }),
            React.createElement('div', { style: { fontWeight: 500, marginBottom: '8px' } }, 'Connect an LLM to get started'),
            React.createElement('div', { style: { fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' } },
              'Click the ',
              React.createElement('img', { src: iconGear, alt: 'settings', width: 14, height: 14, style: { verticalAlign: 'middle' } }),
              ' button in the top-right corner'
            )
          )
        )
  );
}

// Inner component that accesses context
function AdaptiveAppInner({
  turns,
  isLoading,
  error,
  tokenUsage,
  lastRequestUsage,
  useIntents,
  onToggleIntentMode,
  lastRawResponse,
  lastRawRequest,
  lastDecisionLog,
  sendPromptRef,
}: {
  turns: ConversationTurn[];
  isLoading: boolean;
  error: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number };
  lastRequestUsage: { promptTokens: number; completionTokens: number };
  useIntents: boolean;
  onToggleIntentMode: () => void;
  lastRawResponse: string | null;
  lastRawRequest: string | null;
  lastDecisionLog: DecisionEntry[];
  sendPromptRef?: React.MutableRefObject<((prompt: string) => void) | null>;
}) {
  const { dispatch, sendPrompt } = useAdaptive();

  // Expose context-aware sendPrompt to external ref
  useEffect(() => {
    if (sendPromptRef) {
      sendPromptRef.current = sendPrompt;
      return () => { sendPromptRef.current = null; };
    }
  }, [sendPromptRef, sendPrompt]);

  // Sync spec state when turns change
  useEffect(() => {
    if (turns.length > 0) {
      const latestSpec = turns[turns.length - 1].agentSpec;
      dispatch({ type: 'SET_SPEC', spec: latestSpec });
      dispatch({ type: 'SET_LOADING', loading: isLoading });
    }
  }, [turns, isLoading, dispatch]);

  if (turns.length === 0 && !isLoading && !error) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#6b7280' },
    }, 'No conversation started. Provide an initialSpec to begin.');
  }

  return React.createElement(ConversationThread, { turns, isLoading, error, tokenUsage, lastRequestUsage, useIntents, onToggleIntentMode, lastRawResponse, lastRawRequest, lastDecisionLog });
}

export default AdaptiveApp;
