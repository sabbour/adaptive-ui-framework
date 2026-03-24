import React, { createContext, useContext, useCallback, useReducer, type Dispatch } from 'react';
import type { AdaptiveValue, AdaptiveAction, AdaptiveUISpec, AdaptiveTheme } from './schema';
import type { StateStore } from './interpolation';
import { interpolate } from './interpolation';

// ─── Adaptive Context ───
// Provides state, dispatch, and action handling to the entire tree.

interface AdaptiveContextValue {
  state: StateStore;
  dispatch: Dispatch<StateAction>;
  handleAction: (action: AdaptiveAction) => void;
  spec: AdaptiveUISpec | null;
  theme: AdaptiveTheme;
  isLoading: boolean;
  error: string | null;
  sendPrompt: (prompt: string, userDisplayText?: string | null) => void;
  resetSession: () => void;
  /** When true, components should skip side effects (API calls, token validation, etc.) */
  disabled: boolean;
}

type StateAction =
  | { type: 'SET'; key: string; value: AdaptiveValue | AdaptiveValue[] | Record<string, AdaptiveValue>[] }
  | { type: 'MERGE'; values: Record<string, AdaptiveValue> }
  | { type: 'SET_SPEC'; spec: AdaptiveUISpec }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET'; state: StateStore };

interface AdaptiveState {
  store: StateStore;
  spec: AdaptiveUISpec | null;
  isLoading: boolean;
  error: string | null;
}

function reducer(state: AdaptiveState, action: StateAction): AdaptiveState {
  switch (action.type) {
    case 'SET':
      return { ...state, store: { ...state.store, [action.key]: action.value } };
    case 'MERGE':
      return { ...state, store: { ...state.store, ...action.values } };
    case 'SET_SPEC': {
      const newStore = { ...state.store };
      if (action.spec.state) {
        for (const [k, v] of Object.entries(action.spec.state)) {
          if (!(k in newStore)) newStore[k] = v;
        }
      }
      return { ...state, spec: action.spec, store: newStore };
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return { ...state, store: action.state };
    default:
      return state;
  }
}

// Preserve context identity across HMR to prevent "useAdaptive must be used within
// an AdaptiveProvider" errors when context.tsx is hot-reloaded independently.
const AdaptiveContext: React.Context<AdaptiveContextValue | null> =
  (globalThis as any).__ADAPTIVE_CONTEXT__ ??= createContext<AdaptiveContextValue | null>(null);

export function useAdaptive(): AdaptiveContextValue {
  const ctx = useContext(AdaptiveContext);
  if (!ctx) throw new Error('useAdaptive must be used within an AdaptiveProvider');
  return ctx;
}

export function useAdaptiveState<T = AdaptiveValue>(key: string): T {
  const { state } = useAdaptive();
  return state[key] as T;
}

interface AdaptiveProviderProps {
  children?: React.ReactNode;
  initialSpec?: AdaptiveUISpec | null;
  initialState?: StateStore;
  onSendPrompt: (prompt: string, currentState: StateStore, userDisplayText?: string | null) => void;
  onCustomAction?: (name: string, payload: Record<string, unknown> | undefined, state: StateStore) => void;
  onResetSession?: () => void;
  theme?: AdaptiveTheme;
}

export function AdaptiveProvider({
  children,
  initialSpec = null,
  initialState = {},
  onSendPrompt,
  onCustomAction,
  onResetSession,
  theme = {},
}: AdaptiveProviderProps) {
  const [adaptiveState, dispatch] = useReducer(reducer, {
    store: { ...initialState, ...(initialSpec?.state ?? {}) },
    spec: initialSpec,
    isLoading: false,
    error: null,
  });

  const sendPrompt = useCallback(
    (prompt: string, userDisplayText?: string | null) => {
      onSendPrompt(prompt, adaptiveState.store, userDisplayText);
    },
    [onSendPrompt, adaptiveState.store]
  );

  const handleAction = useCallback(
    (action: AdaptiveAction) => {
      if (!action || typeof action !== 'object' || !('type' in action)) {
        return;
      }

      switch (action.type) {
        case 'sendPrompt': {
          const resolvedPrompt = action.prompt
            ? interpolate(action.prompt, adaptiveState.store)
            : '';
          if (resolvedPrompt) sendPrompt(resolvedPrompt, resolvedPrompt);
          break;
        }
        case 'setState': {
          if (action.state) {
            dispatch({ type: 'MERGE', values: action.state });
          }
          break;
        }
        case 'navigate': {
          if (action.target) {
            window.location.href = action.target;
          }
          break;
        }
        case 'submit': {
          // Submit triggers sendPrompt with current state as context
          const safeStore = Object.fromEntries(
            Object.entries(adaptiveState.store).filter(([k]) => !k.startsWith('__'))
          );
          const prompt = action.prompt
            ? interpolate(action.prompt, adaptiveState.store)
            : `Form submitted with data: ${JSON.stringify(safeStore)}`;
          sendPrompt(prompt, null);
          break;
        }
        case 'custom': {
          if (onCustomAction) {
            onCustomAction(action.name ?? '', action.payload, adaptiveState.store);
            break;
          }

          // Fallback: when no host custom handler is wired, convert custom actions
          // into a prompt so the conversation still progresses.
          const payloadPrompt = action.payload && typeof action.payload['prompt'] === 'string'
            ? String(action.payload['prompt'])
            : '';
          const fallbackPrompt = payloadPrompt || (action.name
            ? `Proceed with action: ${action.name}`
            : 'Proceed to the next step.');
          sendPrompt(interpolate(fallbackPrompt, adaptiveState.store), null);
          break;
        }
      }
    },
    [adaptiveState.store, sendPrompt, onCustomAction]
  );

  const mergedTheme: AdaptiveTheme = {
    ...adaptiveState.spec?.theme,
    ...theme,
  };

  const resetSession = useCallback(() => {
    dispatch({ type: 'RESET', state: { ...initialState, ...(initialSpec?.state ?? {}) } });
    onResetSession?.();
  }, [onResetSession, initialState, initialSpec]);

  const contextValue: AdaptiveContextValue = {
    state: adaptiveState.store,
    dispatch,
    handleAction,
    spec: adaptiveState.spec,
    theme: mergedTheme,
    isLoading: adaptiveState.isLoading,
    error: adaptiveState.error,
    sendPrompt,
    resetSession,
    disabled: false,
  };

  return (
    <AdaptiveContext.Provider value={contextValue}>
      {children}
    </AdaptiveContext.Provider>
  );
}

export { AdaptiveContext };
export type { AdaptiveContextValue, StateAction, AdaptiveState };

/** Wraps children in a context override that sets disabled=true.
 *  Components that check useAdaptive().disabled will skip side effects. */
export function DisabledScope({ children }: { children: React.ReactNode }) {
  const parent = useAdaptive();
  const value = React.useMemo(
    () => ({ ...parent, disabled: true }),
    [parent]
  );
  return React.createElement(AdaptiveContext.Provider, { value }, children);
}
