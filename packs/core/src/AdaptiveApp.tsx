import React, { useCallback, useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
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
type AuthMode = 'apiKey' | 'hosted';

interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  authMode: AuthMode;
}

function configKey(appId?: string): string {
  return appId ? `adaptive-ui-config-${appId}` : 'adaptive-ui-config';
}

function loadLLMConfig(appId?: string): LLMConfig {
  try {
    const raw = localStorage.getItem(configKey(appId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { authMode: 'hosted', ...parsed };
    }
  } catch { /* ignore */ }
  return { endpoint: '', apiKey: '', model: 'gpt-4o', authMode: 'hosted' };
}

function saveLLMConfig(config: LLMConfig, appId?: string) {
  localStorage.setItem(configKey(appId), JSON.stringify(config));
}

// ─── Hosted LLM proxy discovery ───
interface HostedModelInfo {
  name: string;
  apiType: 'chat' | 'responses';
}

interface HostedModelsInfo {
  models: HostedModelInfo[];
  default: string;
}

// Module-level cache so the adapter's resolveApiType callback can access it
let cachedHostedModels: HostedModelsInfo | null = null;

async function fetchHostedModels(): Promise<HostedModelsInfo | null> {
  try {
    const resp = await fetch('/api/llm-proxy/models');
    if (!resp.ok) return null;
    const info = await resp.json() as HostedModelsInfo;
    cachedHostedModels = info;
    return info;
  } catch {
    return null;
  }
}

function resolveHostedApiType(model: string): 'chat' | 'responses' {
  const m = cachedHostedModels?.models.find(m => m.name === model);
  return m?.apiType ?? 'chat';
}

// ─── Settings Panel ───
// Built into the framework. Renders LLM config + pack settings + app settings.

function SettingsPanel({
  isConnected,
  onConnect,
  onDisconnect,
  appSettingsComponents,
  visiblePacks,
  settingsPosition,
  models,
  appId,
}: {
  isConnected: boolean;
  onConnect: (config: LLMConfig) => void;
  onDisconnect: () => void;
  appSettingsComponents?: React.ComponentType[];
  visiblePacks?: string[];
  settingsPosition?: { top?: string; right?: string };
  models?: string[];
  appId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(() => loadLLMConfig(appId));
  const [hostedModels, setHostedModels] = useState<HostedModelsInfo | null>(null);
  const [hostedChecked, setHostedChecked] = useState(false);
  const allPackSettings = getPackSettingsComponents();
  const packSettingsList = visiblePacks
    ? allPackSettings.filter(p => visiblePacks.includes(p.name))
    : [];

  // Auto-detect hosted LLM proxy on mount
  useEffect(() => {
    fetchHostedModels().then(info => {
      setHostedModels(info);
      setHostedChecked(true);
      // Auto-select and auto-connect in hosted mode if proxy is available
      // and user hasn't manually configured a BYO API key
      if (info && !isConnected) {
        const saved = loadLLMConfig(appId);
        if (!saved.apiKey) {
          // Prefer the app's first preferred model (from models prop) if available on the server
          const preferred = models?.find(m => info.models.some(hm => hm.name === m));
          const defaultModel = preferred || info.default;
          const hostedConfig: LLMConfig = { ...saved, authMode: 'hosted', model: defaultModel, endpoint: '', apiKey: '' };
          setConfig(hostedConfig);
          saveLLMConfig(hostedConfig, appId);
          onConnect(hostedConfig);
        }
      }
    });
  }, []);

  const handleConnect = () => {
    saveLLMConfig(config, appId);
    onConnect(config);
  };

  return createPortal(React.createElement('div', {
    className: 'adaptive-settings-wrapper',
    style: { position: 'fixed', top: settingsPosition?.top ?? '6px', right: settingsPosition?.right ?? '12px', zIndex: 1001 },
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
        backgroundColor: isConnected ? '#2563eb' : '#d1d5db',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
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

      // Auth mode toggle (only shown when built-in models are available)
      hostedModels && React.createElement('div', {
        style: { display: 'flex', gap: '4px', marginBottom: '12px', borderRadius: 'var(--adaptive-radius)', overflow: 'hidden', border: '1px solid var(--adaptive-border, #e5e7eb)' },
      },
        React.createElement('button', {
          onClick: () => {
            if (config.authMode === 'hosted') return;
            const preferred = models?.find(m => hostedModels.models.some(hm => hm.name === m));
            const hostedConfig: LLMConfig = { ...config, authMode: 'hosted', model: preferred || hostedModels.default, endpoint: '', apiKey: '' };
            setConfig(hostedConfig);
            saveLLMConfig(hostedConfig, appId);
            onConnect(hostedConfig);
          },
          style: {
            flex: 1, padding: '6px 8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 500,
            backgroundColor: config.authMode === 'hosted' ? 'var(--adaptive-primary)' : 'transparent',
            color: config.authMode === 'hosted' ? '#fff' : 'var(--adaptive-text)',
          },
        }, 'Built-in'),
        React.createElement('button', {
          onClick: () => {
            if (config.authMode === 'apiKey') return;
            const byoConfig: LLMConfig = { ...config, authMode: 'apiKey' };
            setConfig(byoConfig);
            saveLLMConfig(byoConfig, appId);
            onDisconnect();
          },
          style: {
            flex: 1, padding: '6px 8px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 500,
            backgroundColor: config.authMode === 'apiKey' ? 'var(--adaptive-primary)' : 'transparent',
            color: config.authMode === 'apiKey' ? '#fff' : 'var(--adaptive-text)',
          },
        }, 'BYO Model')
      ),

      // Built-in mode: model picker (uses server-reported models)
      config.authMode === 'hosted' && hostedModels && React.createElement('label', null, 'Model'),
      config.authMode === 'hosted' && hostedModels && React.createElement('select', {
        value: config.model,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const newModel = e.target.value;
          const updated = { ...config, model: newModel };
          setConfig(updated);
          // Hot-swap model without disconnect/reconnect cycle
          if (isConnected) {
            saveLLMConfig(updated, appId);
            onConnect(updated);
          }
        },
        style: { marginBottom: '14px' },
      },
        ...hostedModels.models.map(m =>
          React.createElement('option', { key: m.name, value: m.name }, m.name)
        )
      ),

      // BYO Model mode: Endpoint
      config.authMode === 'apiKey' && React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' } }, 'Endpoint'),
      config.authMode === 'apiKey' && React.createElement('input', {
        type: 'text', value: config.endpoint,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, endpoint: e.target.value })),
        placeholder: 'https://api.openai.com/v1/chat/completions',
        disabled: isConnected,
        style: { marginBottom: '10px' },
      }),

      // BYO Model mode: API Key
      config.authMode === 'apiKey' && React.createElement('label', null, 'API Key'),
      config.authMode === 'apiKey' && React.createElement('input', {
        type: 'password', value: config.apiKey,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, apiKey: e.target.value })),
        placeholder: 'sk-...', disabled: isConnected,
        style: { marginBottom: '10px' },
      }),

      // BYO Model mode: Model
      config.authMode === 'apiKey' && React.createElement('label', null, 'Model'),
      config.authMode === 'apiKey' && React.createElement('input', {
        type: 'text', value: config.model,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfig((c) => ({ ...c, model: e.target.value })),
        placeholder: 'gpt-4o', disabled: isConnected,
        style: { marginBottom: '14px' },
      }),

      // BYO Model mode: connect/disconnect button
      config.authMode === 'apiKey' && React.createElement('button', {
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

      !isConnected && config.authMode === 'apiKey' && React.createElement('p', {
        style: { fontSize: '12px', color: 'var(--adaptive-text-secondary)', margin: '10px 0 0', lineHeight: 1.4 },
      }, 'Bring your own OpenAI-compatible API. Leave endpoint blank for default OpenAI.'),

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
  ), document.body);
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
      right: '12px',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
      fontSize: '10px',
      fontFamily: 'Consolas, "Courier New", monospace',
      color: 'var(--adaptive-text-secondary, #6b7280)',
      maxWidth: '40vw',
      pointerEvents: 'none' as const,
      alignItems: 'flex-end' as const,
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

  /** Ref callback that receives the sendPrompt function, allowing external components to trigger prompts */
  sendPromptRef?: React.MutableRefObject<((prompt: string) => void) | null>;

  /** Restrict which pack settings appear in the settings panel. Defaults to none — explicitly list pack names to show. */
  visiblePacks?: string[];

  /** Override the settings gear position. Defaults to { top: '6px', right: '12px' }. */
  settingsPosition?: { top?: string; right?: string };

  /** List of model names to show in a dropdown. When not provided, the model field is a free-text input. */
  models?: string[];

  /** Unique app identifier. When set, LLM config (model, endpoint) is stored per-app in localStorage. */
  appId?: string;
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
  sendPromptRef,
  visiblePacks,
  settingsPosition,
  models,
  appId,
}: AdaptiveAppProps) {
  // ─── Internal adapter management ───
  const [isConnected, setIsConnected] = useState(() => {
    if (externalAdapter) return true;
    const cfg = loadLLMConfig(appId);
    if (cfg.authMode === 'hosted') return true;
    return !!cfg.apiKey.trim();
  });
  const [adapterKey, setAdapterKey] = useState(0);

  const adapter: LLMAdapter | null = useMemo(() => {
    if (externalAdapter) return externalAdapter;
    if (!isConnected) return null;
    const config = loadLLMConfig(appId);
    // Hosted mode: use server-side proxy (no API key sent to browser)
    if (config.authMode === 'hosted') {
      return new OpenAIAdapter({
        apiKey: '',
        endpoint: window.location.origin + '/api/llm-proxy',
        model: config.model || 'gpt-4o',
        systemPromptOverride,
        systemPromptSuffix,
        resolveApiType: resolveHostedApiType,
      });
    }
    return new OpenAIAdapter({
      apiKey: config.apiKey,
      endpoint: config.endpoint || undefined,
      model: config.model || 'gpt-4o',
      systemPromptOverride,
      systemPromptSuffix,
    });
  }, [externalAdapter, isConnected, adapterKey, systemPromptOverride, systemPromptSuffix]);

  const handleConnect = useCallback((config: LLMConfig) => {
    saveLLMConfig(config, appId);
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

  // Rewind state
  const lastSentRef = useRef<{ prompt: string; state: StateStore; userDisplayText?: string | null } | null>(null);
  const rewindPendingRef = useRef<{ prompt: string; state: StateStore; userDisplayText?: string | null } | null>(null);

  // Rebuild conversation history from restored turns (page reload / session restore)
  // Without this, the LLM loses all context when turns are restored from localStorage.
  useEffect(() => {
    if (historyRef.current.length > 0 || turns.length === 0) return;
    const rebuilt: LLMMessage[] = [];
    for (const turn of turns) {
      if (turn.userMessage) {
        const safeData = turn.userData
          ? Object.fromEntries(Object.entries(turn.userData).filter(([k]) => !k.startsWith('__')))
          : {};
        rebuilt.push({
          role: 'user',
          content: `User responded: "${turn.userMessage}"\nCurrent collected data: ${JSON.stringify(safeData)}`,
        });
      }
      if (turn.agentSpec) {
        rebuilt.push({
          role: 'assistant',
          content: summarizeSpec(turn.agentSpec),
        });
      }
    }
    if (rebuilt.length > 0) {
      historyRef.current = rebuilt;
    }
  }, []); // Run once on mount

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

      // Save prompt info for potential rewind
      lastSentRef.current = { prompt, state: currentState, userDisplayText };

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

  // ─── Rewind & Reissue ───
  const handleRewind = useCallback((modelOverride?: string) => {
    if (turns.length < 2 || !lastSentRef.current) return;

    const pending = lastSentRef.current;

    // Pop the last turn and clear userMessage from the now-last turn
    setTurns(prev => {
      if (prev.length < 2) return prev;
      const updated = prev.slice(0, -1);
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        userMessage: undefined,
        userData: undefined,
      };
      return updated;
    });

    // Pop last 2 entries from historyRef (user prompt + assistant response)
    if (historyRef.current.length >= 2) {
      historyRef.current = historyRef.current.slice(0, -2);
    }

    // Reset busy/loading state
    busyRef.current = false;
    setIsLoading(false);
    setError(null);

    if (modelOverride) {
      // Model switch: save new model, bump adapter key so useMemo recreates it,
      // then use the pending-ref + effect to fire after the new adapter is ready.
      const config = loadLLMConfig(appId);
      saveLLMConfig({ ...config, model: modelOverride }, appId);
      rewindPendingRef.current = pending;
      setIsConnected(true);
      setAdapterKey(k => k + 1);
    } else {
      // Same model: adapter is unchanged, re-send after React flushes state updates.
      // Use setTimeout to ensure setTurns/setIsLoading have committed.
      setTimeout(() => {
        handleSendPrompt(pending.prompt, pending.state, pending.userDisplayText);
      }, 0);
    }
  }, [turns.length, appId, handleSendPrompt]);

  // Process pending rewinds after model switch (adapter recreated by useMemo)
  useEffect(() => {
    const pending = rewindPendingRef.current;
    if (pending && adapter && !busyRef.current) {
      rewindPendingRef.current = null;
      handleSendPrompt(pending.prompt, pending.state, pending.userDisplayText);
    }
  }, [adapter, handleSendPrompt]);

  // Derive available models and current model for rewind UI
  const currentModel = useMemo(() => loadLLMConfig(appId).model || 'gpt-4o', [adapterKey]);
  const rewindModels = useMemo(() => {
    if (cachedHostedModels) return cachedHostedModels.models.map(m => m.name);
    return models ?? [];
  }, [adapterKey, models]);

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
      settingsPosition,
      models,
      appId,
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
          React.createElement(AdaptiveAppInner, { turns, isLoading, error, tokenUsage, lastRequestUsage, lastRawResponse, lastRawRequest, lastDecisionLog, sendPromptRef: externalSendPromptRef, onRewind: handleRewind, rewindModels, currentModel })
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
  lastRawResponse,
  lastRawRequest,
  lastDecisionLog,
  sendPromptRef,
  onRewind,
  rewindModels,
  currentModel,
}: {
  turns: ConversationTurn[];
  isLoading: boolean;
  error: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number };
  lastRequestUsage: { promptTokens: number; completionTokens: number };
  lastRawResponse: string | null;
  lastRawRequest: string | null;
  lastDecisionLog: DecisionEntry[];
  sendPromptRef?: React.MutableRefObject<((prompt: string) => void) | null>;
  onRewind?: (modelOverride?: string) => void;
  rewindModels?: string[];
  currentModel?: string;
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

  return React.createElement(ConversationThread, { turns, isLoading, error, tokenUsage, lastRequestUsage, lastRawResponse, lastRawRequest, lastDecisionLog, onRewind, rewindModels, currentModel });
}

export default AdaptiveApp;
