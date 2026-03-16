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
}: {
  isConnected: boolean;
  onConnect: (config: { endpoint: string; apiKey: string; model: string }) => void;
  onDisconnect: () => void;
  appSettingsComponents?: React.ComponentType[];
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(loadLLMConfig);
  const packSettingsList = getPackSettingsComponents();

  const handleConnect = () => {
    saveLLMConfig(config);
    onConnect(config);
  };

  return React.createElement('div', {
    style: { position: 'fixed', top: '12px', right: '12px', zIndex: 1000 },
  },
    open && React.createElement('div', {
      onClick: () => setOpen(false),
      style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
    }),

    React.createElement('button', {
      onClick: () => setOpen((o) => !o),
      style: {
        width: '36px', height: '36px', borderRadius: '50%',
        border: 'none', cursor: 'pointer',
        backgroundColor: isConnected ? 'var(--adaptive-primary)' : 'var(--adaptive-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--adaptive-shadow-md)',
        padding: 0,
      },
      title: isConnected ? 'Connected to LLM' : 'Configure LLM',
    },
      React.createElement('img', {
        src: isConnected ? iconConnect : iconGear,
        alt: '', width: 18, height: 18,
        style: { filter: isConnected ? 'brightness(0) invert(1)' : 'none' },
      })
    ),

    open && React.createElement('div', {
      className: 'adaptive-settings-panel',
      style: {
        position: 'absolute', top: '44px', right: '0',
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

      React.createElement('label', { style: { display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' } }, 'Endpoint'),
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
          fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          backgroundColor: isConnected ? 'var(--adaptive-surface)' : 'var(--adaptive-primary)',
          color: isConnected ? 'var(--adaptive-text)' : '#fff',
          boxShadow: isConnected ? 'inset 0 0 0 1px var(--adaptive-border)' : 'none',
        },
      }, isConnected ? 'Disconnect' : 'Connect'),

      !isConnected && React.createElement('p', {
        style: { fontSize: '11px', color: 'var(--adaptive-text-secondary)', margin: '10px 0 0', lineHeight: 1.4 },
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
  const isActive = activeRequests.length > 0;

  return React.createElement('div', {
    style: {
      position: 'fixed',
      top: '12px',
      left: '12px',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      borderRadius: '999px',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      border: '1px solid var(--adaptive-border, #e5e7eb)',
      boxShadow: 'var(--adaptive-shadow-sm)',
      fontSize: '11px',
      fontFamily: 'var(--adaptive-font-mono, monospace)',
      color: 'var(--adaptive-text-secondary, #6b7280)',
      maxWidth: '48vw',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
    } as React.CSSProperties,
    title: isActive
      ? activeRequests.map((r) => `${r.method} ${r.url}`).join('\n')
      : 'No active HTTP requests',
  },
    React.createElement('div', {
      style: {
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        backgroundColor: isActive ? '#F59E0B' : '#9CA3AF',
        animation: isActive ? 'adaptive-pulse 1s ease-in-out infinite' : 'none',
        flexShrink: 0,
      } as React.CSSProperties,
    }),
    isActive
      ? `${activeRequests.length} request${activeRequests.length === 1 ? '' : 's'}: ${activeRequests.map((r) => `${r.method} ${r.url}`).join(' · ')}`
      : 'HTTP idle'
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

  /** Additional settings components to inject into the settings panel */
  settingsComponents?: React.ComponentType[];

  /** Wrapper class name */
  className?: string;

  /** Wrapper style */
  style?: React.CSSProperties;
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
  settingsComponents,
  className,
  style,
}: AdaptiveAppProps) {
  // ─── Internal adapter management ───
  const [isConnected, setIsConnected] = useState(() => {
    if (externalAdapter) return true;
    return !!loadLLMConfig().apiKey.trim();
  });
  const [adapterKey, setAdapterKey] = useState(0);

  const adapter: LLMAdapter | null = useMemo(() => {
    if (externalAdapter) return externalAdapter;
    if (!isConnected) return null;
    const config = loadLLMConfig();
    return new OpenAIAdapter({
      apiKey: config.apiKey,
      endpoint: config.endpoint || undefined,
      model: config.model || 'gpt-4o',
      systemPromptOverride,
    });
  }, [externalAdapter, isConnected, adapterKey, systemPromptOverride]);

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
    async (prompt: string, currentState: StateStore) => {
      if (busyRef.current || !adapter) return;
      busyRef.current = true;

      try {
        setIsLoading(true);
        setError(null);

        // Capture user data from state for the current turn summary
        const userData = { ...currentState };

        // Update the last turn with user data
        setTurns(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const lastTurn = { ...updated[updated.length - 1] };
          // Strip sensitive (__-prefixed) state values from the displayed user message
          let displayPrompt = prompt;
          for (const [k, v] of Object.entries(currentState)) {
            if (k.startsWith('__') && typeof v === 'string' && v.length > 0) {
              displayPrompt = displayPrompt.split(v).join('');
            }
          }
          // Clean up extra whitespace
          displayPrompt = displayPrompt.replace(/\s{2,}/g, ' ').trim();
          lastTurn.userMessage = displayPrompt;
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

        // Trim history
        if (historyRef.current.length > maxHistory) {
          historyRef.current = historyRef.current.slice(-maxHistory);
        }

        const result = await adapter.generateUI(prompt, currentState, historyRef.current);

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
          React.createElement(AdaptiveAppInner, { turns, isLoading, error, tokenUsage, lastRequestUsage })
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
            React.createElement('div', { style: { fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' } },
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
}: {
  turns: ConversationTurn[];
  isLoading: boolean;
  error: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number };
  lastRequestUsage: { promptTokens: number; completionTokens: number };
}) {
  const { dispatch } = useAdaptive();

  // Sync spec state when turns change
  useEffect(() => {
    if (turns.length > 0) {
      const latestSpec = turns[turns.length - 1].agentSpec;
      dispatch({ type: 'SET_SPEC', spec: latestSpec });
      dispatch({ type: 'SET_LOADING', loading: isLoading });
    }
  }, [turns, isLoading, dispatch]);

  if (error) {
    return React.createElement('div', {
      style: {
        padding: '20px', margin: '20px',
        backgroundColor: '#fef2f2', border: '1px solid #fecaca',
        borderRadius: '8px', color: '#991b1b',
      },
    },
      React.createElement('strong', null, 'Error: '),
      error
    );
  }

  if (turns.length === 0 && !isLoading) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#6b7280' },
    }, 'No conversation started. Provide an initialSpec to begin.');
  }

  return React.createElement(ConversationThread, { turns, isLoading, tokenUsage, lastRequestUsage });
}

export default AdaptiveApp;
