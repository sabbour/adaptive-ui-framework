import React, { useCallback, useEffect, useRef, useState, memo, useSyncExternalStore } from 'react';
import type { ConversationTurn } from '../schema';
import type { DecisionEntry } from '../decision-log';
import { AdaptiveRenderer } from '../renderer';
import { useAdaptive, DisabledScope } from '../context';
import { simpleMarkdown, promptHistory, MAX_PROMPT_HISTORY } from './builtins';
import { getCompletedRequests, subscribeCompleted } from '../request-tracker';
import { resolveHostedPricing } from '../AdaptiveApp';


// Icons
import iconBrainSparkle from '../icons/fluent/brain-sparkle.svg?url';
import iconCommentEdit from '../icons/fluent/comment-edit.svg?url';
import iconArrowReset from '../icons/fluent/arrow-reset.svg?url';

// Filter state entries for display: exclude internal keys, large values, and JSON blobs
function summarizableEntries(data: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(data)
    .filter(([k, v]) => !k.startsWith('__') && v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return [k, s] as [string, string];
    })
    .filter(([, s]) => s.length < 200 && !s.startsWith('[{') && !s.startsWith('{"'));
}

// Extract a flat list of component types + key props from a layout node tree
interface ComponentEntry { type: string; props: string[]; depth: number; }

function extractComponentTree(node: any, depth?: number): ComponentEntry[] {
  if (!node) return [];
  const d = depth ?? 0;
  const entries: ComponentEntry[] = [];
  const type: string = node.type || '?';
  // Gather interesting props (skip type, children, style, className, id)
  const skip = new Set(['type', 'children', 'ch', 'style', 'className', 'id', 'tabs', 'items', 'visible']);
  const props = Object.keys(node).filter(k => !skip.has(k) && node[k] !== undefined && node[k] !== null);
  // Summarize prop values to keep it short
  const propSummary = props.slice(0, 6).map(k => {
    const v = node[k];
    if (typeof v === 'string') return k + '="' + (v.length > 30 ? v.slice(0, 27) + '...' : v) + '"';
    if (typeof v === 'boolean') return v ? k : '';
    if (typeof v === 'number') return k + '=' + v;
    return k;
  }).filter(Boolean);
  entries.push({ type, props: propSummary, depth: d });
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) entries.push(...extractComponentTree(child, d + 1));
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      entries.push({ type: 'tab', props: [tab.label ? 'label="' + tab.label + '"' : ''].filter(Boolean), depth: d + 1 });
      const tabKids = tab.children || [];
      for (const child of tabKids) entries.push(...extractComponentTree(child, d + 2));
    }
  }
  if (Array.isArray(node.items)) {
    for (const item of node.items) entries.push(...extractComponentTree(item, d + 1));
  }
  return entries;
}

// Reusable AI avatar element
function AgentAvatar() {
  return React.createElement('div', {
    style: {
      width: '28px', height: '28px', borderRadius: '50%',
      backgroundColor: 'var(--adaptive-primary, #2563eb)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
  },
    React.createElement('img', {
      src: iconBrainSparkle, alt: 'AI',
      className: 'adaptive-icon',
      style: {
        width: '18px', height: '18px',
        filter: 'brightness(0) invert(1)',
      },
    })
  );
}

// ─── Past Turn ───
// Memoized to avoid re-rendering the full history on each new turn.
const PastTurn = memo(function PastTurn({ turn }: { turn: ConversationTurn }) {
  return React.createElement('div', { style: { marginBottom: '8px' } },
    // Agent message
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'flex-start', padding: '0 24px' },
    },
      React.createElement('div', { style: { width: '100%', maxWidth: '100%' } },
        turn.agentSpec.agentMessage && React.createElement('div', {
          style: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' },
        },
          React.createElement(AgentAvatar),
          React.createElement('div', {
            style: {
              padding: '8px 14px', borderRadius: 'var(--adaptive-radius, 8px)',
              backgroundColor: 'var(--adaptive-surface, #fff)',
              border: '1px solid #e5e7eb', fontSize: '15px', lineHeight: '1.6', flex: 1, minWidth: 0,
            } as React.CSSProperties,
            dangerouslySetInnerHTML: { __html: simpleMarkdown(turn.agentSpec.agentMessage) },
          })
        ),

        // Past turn layout (disabled — shows what was presented)
        turn.agentSpec.layout && React.createElement('div', {
          style: {
            marginLeft: '38px', marginBottom: '8px', minWidth: 0, overflow: 'hidden',
            opacity: 0.5, pointerEvents: 'none' as const, userSelect: 'none' as const,
          },
        },
          React.createElement(DisabledScope, null,
            React.createElement(ActiveTurnUI, { node: turn.agentSpec.layout, onSend: () => {} })
          )
        ),

      )
    ),

    // User message bubble (shown after the agent message it replies to)
    turn.userMessage && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', padding: '0 24px' },
    },
      React.createElement('div', {
        style: {
          maxWidth: '70%', padding: '10px 16px',
          borderRadius: '16px 16px 4px 16px',
          backgroundColor: 'var(--adaptive-primary, #2563eb)',
          color: '#fff', fontSize: '15px', lineHeight: '1.5',
        } as React.CSSProperties,
      }, turn.userMessage)
    )
  );
});

// ─── Active Turn ───
// The latest turn with interactive UI + escape hatch text input.
// Collapses to a summary once the user submits/proceeds.

/** Check if a layout node tree already contains a chatInput (free-form conversation input).
 *  Regular bound text inputs (e.g., "departure city") are form fields, not escape hatches. */
function hasChatInput(node: any): boolean {
  if (!node) return false;
  const t = node.type || node.t;
  if (t === 'chatInput' || t === 'ci') return true;
  // Recurse children
  const kids = node.children || node.ch || [];
  for (const child of kids) {
    if (hasChatInput(child)) return true;
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) for (const child of tab.children) { if (hasChatInput(child)) return true; }
    }
  }
  return false;
}

/** Check if the layout is just a standalone chatInput with no other content.
 *  When true, we render it in the fixed bottom bar instead of inline. */
function isBareChatInput(node: any): boolean {
  if (!node) return false;
  const t = node.type || node.t;
  return t === 'chatInput' || t === 'ci';
}

function ActiveTurn({ turn }: { turn: ConversationTurn }) {
  const { sendPrompt, state, isLoading } = useAdaptive();
  const [submitted, setSubmitted] = useState(false);

  // Collapse if submitted locally OR if a prompt was sent via another path (e.g. chatInput)
  const isCollapsed = submitted || !!turn.userMessage || isLoading;

  // Wrap sendPrompt to collapse on submit
  const handleSend = (text: string) => {
    setSubmitted(true);
    sendPrompt(text);
  };

  return React.createElement('div', { style: { marginBottom: '8px' } },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'flex-start', padding: '0 24px' },
    },
      React.createElement('div', { style: { width: '100%', maxWidth: '100%' } },
        turn.agentSpec.agentMessage && React.createElement('div', {
          style: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' },
        },
          React.createElement(AgentAvatar),
          React.createElement('div', {
            style: {
              padding: '8px 14px', borderRadius: 'var(--adaptive-radius, 8px)',
              backgroundColor: 'var(--adaptive-surface, #fff)',
              border: '1px solid #e5e7eb', fontSize: '15px', lineHeight: '1.6', flex: 1, minWidth: 0,
            } as React.CSSProperties,
            dangerouslySetInnerHTML: { __html: simpleMarkdown(turn.agentSpec.agentMessage) },
          })
        ),

        // ── Interactive UI (disabled after submit) ──
        // Skip rendering if layout is a bare chatInput (it renders in the fixed bottom bar)
        !isBareChatInput(turn.agentSpec.layout) && React.createElement('div', {
          style: {
            marginLeft: '38px', marginBottom: '8px', minWidth: 0,
            overflow: isCollapsed ? 'hidden' : 'visible',
            ...(isCollapsed ? { opacity: 0.5, pointerEvents: 'none' as const, userSelect: 'none' as const } : {}),
          },
        },
          React.createElement(ActiveTurnUI, { node: turn.agentSpec.layout, onSend: handleSend })
        )
      )
    ),

    // User message bubble (shown after the agent content it replies to)
    turn.userMessage && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', padding: '0 24px' },
    },
      React.createElement('div', {
        style: {
          maxWidth: '70%', padding: '10px 16px',
          borderRadius: '16px 16px 4px 16px',
          backgroundColor: 'var(--adaptive-primary, #2563eb)',
          color: '#fff', fontSize: '15px', lineHeight: '1.5',
        } as React.CSSProperties,
      }, turn.userMessage)
    )
  );
}

// Wrapper that intercepts sendPrompt actions to trigger collapse
function ActiveTurnUI({ node, onSend }: { node: any; onSend: (text: string) => void }) {
  return React.createElement(AdaptiveRenderer, { node });
}

// ─── Conversation Thread ───

interface ConversationThreadProps {
  turns: ConversationTurn[];
  isLoading: boolean;
  error?: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number };
  lastRequestUsage: { promptTokens: number; completionTokens: number };
  lastRawResponse?: string | null;
  lastRawRequest?: string | null;
  lastDecisionLog?: DecisionEntry[];
  onRewind?: (modelOverride?: string) => void;
  rewindModels?: string[];
  currentModel?: string;
}

export function ConversationThread({ turns, isLoading, error, tokenUsage, lastRequestUsage, lastRawResponse, lastRawRequest, lastDecisionLog, onRewind, rewindModels, currentModel }: ConversationThreadProps) {
  const { resetSession, sendPrompt } = useAdaptive();
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestTurnRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const isScrolledUpRef = useRef(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Debug panel state
  const [showDebug, setShowDebug] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null);
  const apiRequests = useSyncExternalStore(subscribeCompleted, getCompletedRequests);

  // ─── Cost estimation ───
  // Pricing sourced from /api/llm-proxy/models (configured per-model in LLM_PROXY_MODELS_CONFIG).
  // Falls back to conservative defaults if the model has no pricing configured.
  const DEFAULT_PRICING = { inputPer1M: 2.50, outputPer1M: 10.00 }; // conservative fallback

  function estimateCost(usage: { promptTokens: number; completionTokens: number }, model?: string): number {
    const hosted = model ? resolveHostedPricing(model) : null;
    const pricing = hosted || DEFAULT_PRICING;
    return (usage.promptTokens / 1_000_000) * pricing.inputPer1M
         + (usage.completionTokens / 1_000_000) * pricing.outputPer1M;
  }

  function formatCost(usd: number): string {
    if (usd < 0.005) return '<$0.01';
    return '$' + usd.toFixed(2);
  }

  const lastCost = estimateCost(lastRequestUsage, currentModel);
  const totalCost = estimateCost(tokenUsage, currentModel);

  // Rewind state
  const [rewindModel, setRewindModel] = useState<string | undefined>(undefined);
  const canRewind = !!onRewind && turns.length >= 2 && !isLoading;

  // Escape hatch state (lifted from ActiveTurn so it can render in the fixed bottom bar)
  const [escapeText, setEscapeText] = useState('');
  const [escapeHistoryIndex, setEscapeHistoryIndex] = useState(-1);
  const escapeDraftRef = useRef('');

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const latestIsCollapsed = !latestTurn || !!latestTurn.userMessage || isLoading;
  const latestIsBareChatInput = latestTurn ? isBareChatInput(latestTurn.agentSpec.layout) : false;
  // Always show escape hatch when there's an active, non-collapsed turn.
  // Even if the layout contains a chatInput, the escape hatch lets the user
  // override the structured UI with free-text.
  const showEscapeHatch = !latestIsCollapsed;
  const escapeHatchPlaceholder = latestIsBareChatInput && (latestTurn?.agentSpec.layout as any)?.placeholder
    ? (latestTurn!.agentSpec.layout as any).placeholder
    : 'Describe what you want instead...';

  const handleEscapeSend = () => {
    const text = escapeText.trim();
    if (!text) return;
    if (promptHistory.length === 0 || promptHistory[promptHistory.length - 1] !== text) {
      promptHistory.push(text);
      if (promptHistory.length > MAX_PROMPT_HISTORY) promptHistory.shift();
    }
    setEscapeText('');
    setEscapeHistoryIndex(-1);
    escapeDraftRef.current = '';
    sendPrompt(text);
  };

  const handleEscapeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEscapeSend();
      return;
    }
    if (e.key === 'ArrowUp') {
      if (promptHistory.length === 0) return;
      e.preventDefault();
      if (escapeHistoryIndex === -1) escapeDraftRef.current = escapeText;
      const newIndex = escapeHistoryIndex === -1
        ? promptHistory.length - 1
        : Math.max(0, escapeHistoryIndex - 1);
      setEscapeHistoryIndex(newIndex);
      setEscapeText(promptHistory[newIndex]);
      return;
    }
    if (e.key === 'ArrowDown') {
      if (escapeHistoryIndex === -1) return;
      e.preventDefault();
      const newIndex = escapeHistoryIndex + 1;
      if (newIndex >= promptHistory.length) {
        setEscapeHistoryIndex(-1);
        setEscapeText(escapeDraftRef.current);
      } else {
        setEscapeHistoryIndex(newIndex);
        setEscapeText(promptHistory[newIndex]);
      }
      return;
    }
  };


  // On mount, scroll to the latest turn if restoring a session
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!didInitialScroll.current && turns.length > 1 && bottomRef.current) {
      didInitialScroll.current = true;
      // Use requestAnimationFrame to ensure DOM has rendered restored turns
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, [turns.length]);

  const prevTurnCountRef = useRef(turns.length);
  useEffect(() => {
    const newTurnArrived = turns.length > prevTurnCountRef.current;
    prevTurnCountRef.current = turns.length;

    if (newTurnArrived) {
      if (isScrolledUpRef.current) {
        // User is scrolled up — show indicator instead of auto-scrolling
        setHasNewMessage(true);
      } else if (latestTurnRef.current) {
        // At bottom — scroll to the TOP of the new response
        latestTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (isLoading && !isScrolledUpRef.current) {
      // Keep typing indicator visible only if user is already near the bottom.
      // If they've scrolled up, don't yank the scroll position.
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns.length, turns[turns.length - 1]?.id, isLoading]);

  // Track scroll position to detect if user scrolled away from bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      const scrolledUp = !atBottom;
      isScrolledUpRef.current = scrolledUp;
      setIsScrolledUp(scrolledUp);
      if (atBottom) setHasNewMessage(false);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToLatest = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasNewMessage(false);
  }, []);

  const showReset = turns.length > 1 || (turns.length === 1 && turns[0].userMessage);

  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
    } as React.CSSProperties,
  },
    // ─── Scrollable conversation area ───
    React.createElement('div', {
      ref: scrollContainerRef,
      style: {
        flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 0',
        position: 'relative' as const,
      } as React.CSSProperties,
    },
    // Past turns (memoized)
    ...turns.slice(0, -1).map((turn) =>
      React.createElement(PastTurn, { key: turn.id, turn })
    ),

    // Active turn
    turns.length > 0 && React.createElement('div', { ref: latestTurnRef },
      React.createElement(ActiveTurn, {
        key: turns[turns.length - 1].id,
        turn: turns[turns.length - 1],
      })
    ),

    // Loading indicator
    isLoading && React.createElement('div', {
      style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '12px 24px' },
    },
      React.createElement(AgentAvatar),
      React.createElement('div', {
        style: {
          display: 'flex', gap: '4px', alignItems: 'center', padding: '12px 16px',
          borderRadius: '4px 16px 16px 16px',
          backgroundColor: 'var(--adaptive-surface, #fff)',
          border: '1px solid #e5e7eb',
        },
      },
        React.createElement('div', { className: 'adaptive-typing-dot', style: { animationDelay: '0s' } }),
        React.createElement('div', { className: 'adaptive-typing-dot', style: { animationDelay: '0.15s' } }),
        React.createElement('div', { className: 'adaptive-typing-dot', style: { animationDelay: '0.3s' } }),
      )
    ),

    // Inline error banner (doesn't replace the UI)
    error && React.createElement('div', {
      style: {
        margin: '8px 24px', padding: '12px 16px', borderRadius: '8px',
        backgroundColor: '#fef2f2', border: '1px solid #fecaca',
        color: '#991b1b', fontSize: '15px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      },
    },
      React.createElement('span', { style: { fontSize: '16px', lineHeight: 1, flexShrink: 0 } }, '⚠'),
      React.createElement('div', null,
        React.createElement('strong', null, 'Error: '),
        error,
        error.includes('finish_reason=length') && React.createElement('div', {
          style: { marginTop: '6px', fontSize: '13px', color: '#b91c1c' },
        }, 'The LLM ran out of output tokens. Try resetting the chat for smaller payloads.')
      )
    ),

    // Scroll anchor — placed after conversation content, before toolbar/debug
    React.createElement('div', { ref: bottomRef }),
    ), // end scrollable conversation area

    // Scroll to latest button (shown when scrolled up)
    isScrolledUp && React.createElement('div', {
      style: {
        display: 'flex', justifyContent: 'center',
        position: 'relative' as const,
        marginTop: '-40px',
        zIndex: 5,
        pointerEvents: 'none' as const,
      },
    },
      React.createElement('button', {
        onClick: scrollToLatest,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 16px',
          borderRadius: '20px',
          border: 'none',
          backgroundColor: hasNewMessage ? 'var(--adaptive-primary, #2563eb)' : 'rgba(0,0,0,0.7)',
          color: '#fff',
          fontSize: '13px', fontWeight: 500,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'auto' as const,
          animation: hasNewMessage ? 'adaptive-pulse 1.5s ease-in-out infinite' : 'none',
        },
      },
        hasNewMessage ? 'New message \u2193' : 'Scroll to latest \u2193'
      )
    ),

    // ─── Fixed bottom bar ───
    React.createElement('div', {
      style: {
        flexShrink: 0,
        flexGrow: 0,
        maxHeight: showDebug ? '50vh' : undefined,
        overflowY: showDebug ? 'auto' as const : 'visible' as const,
        borderTop: '1px solid var(--adaptive-border, #e5e7eb)',
        backgroundColor: 'var(--adaptive-bg, #f5f5f5)',
      } as React.CSSProperties,
    },

    // Escape hatch textarea (shown when active turn has no chatInput)
    React.createElement('div', {
      style: {
        display: showEscapeHatch ? 'flex' : 'none',
        gap: '8px', alignItems: 'flex-end',
        padding: '8px 24px',
      },
    },
      React.createElement('textarea', {
        value: escapeText,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => { setEscapeText(e.target.value); setEscapeHistoryIndex(-1); },
        onKeyDown: handleEscapeKeyDown,
        placeholder: escapeHatchPlaceholder,
        rows: 2,
        style: {
          flex: 1, padding: '8px 10px', borderRadius: '8px',
          fontSize: '14px', fontFamily: 'inherit', minHeight: '36px',
          border: '1px solid var(--adaptive-border, #e5e7eb)',
          resize: 'vertical' as const,
        },
      }),
      React.createElement('button', {
        onClick: handleEscapeSend,
        disabled: !escapeText.trim(),
        style: {
          padding: '8px 14px', borderRadius: 'var(--adaptive-radius, 8px)',
          border: 'none', fontSize: '14px', fontWeight: 500,
          cursor: escapeText.trim() ? 'pointer' : 'default',
          backgroundColor: 'var(--adaptive-primary, #2563eb)',
          color: '#fff',
          opacity: escapeText.trim() ? 1 : 0.5,
          flexShrink: 0, alignSelf: 'flex-end',
        },
      }, 'Send')
    ),
    // Reset session button + token counter
    React.createElement('div', {
      style: {
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
        padding: '8px 24px', flexWrap: 'wrap' as const,
      },
    },
      showReset && React.createElement('button', {
        onClick: resetSession,
        title: 'Reset chat session',
        style: {
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
          borderRadius: '16px', padding: '3px 12px 3px 8px',
          fontSize: '13px', color: 'var(--adaptive-text-secondary, #6b7280)',
          cursor: 'pointer', whiteSpace: 'nowrap' as const,
          lineHeight: '1.4',
        },
      },
        React.createElement('img', {
          src: iconArrowReset, alt: '', width: 13, height: 13,
          style: { opacity: 0.5 },
        }),
        'New chat'
      ),
      (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0)
        ? React.createElement('span', {
            title: `Last request — Input: ${lastRequestUsage.promptTokens.toLocaleString()} / Output: ${lastRequestUsage.completionTokens.toLocaleString()} (${formatCost(lastCost)})\nTotal — Input: ${tokenUsage.promptTokens.toLocaleString()} / Output: ${tokenUsage.completionTokens.toLocaleString()} (${formatCost(totalCost)})\nModel: ${currentModel || 'unknown'}`,
            style: {
              fontSize: '12px', color: 'var(--adaptive-text-secondary, #6b7280)',
              fontFamily: 'monospace', whiteSpace: 'nowrap',
            },
          },
            `▲ ${lastRequestUsage.promptTokens.toLocaleString()}  ▼ ${lastRequestUsage.completionTokens.toLocaleString()}`,
            React.createElement('span', {
              style: { margin: '0 6px', color: 'var(--adaptive-border, #d1d5db)' },
            }, '│'),
            `Σ ${tokenUsage.promptTokens.toLocaleString()} / ${tokenUsage.completionTokens.toLocaleString()}`,
            React.createElement('span', {
              style: { margin: '0 6px', color: 'var(--adaptive-border, #d1d5db)' },
            }, '│'),
            React.createElement('span', {
              style: { color: totalCost > 0.50 ? '#d97706' : 'var(--adaptive-text-secondary, #6b7280)' },
            }, formatCost(totalCost))
          )
        : React.createElement('span', {
            style: {
              fontSize: '12px', color: 'var(--adaptive-text-secondary, #6b7280)',
              fontFamily: 'monospace', whiteSpace: 'nowrap',
            },
          }, '▲ 0  ▼ 0 │ Σ 0 / 0'),
      // Output pressure indicator — tracks completion tokens vs typical max
      lastRequestUsage.completionTokens > 3000 && React.createElement('span', {
        title: `Last response used ${lastRequestUsage.completionTokens.toLocaleString()} output tokens. If this approaches the max_completion_tokens limit, responses may get truncated (finish_reason=length).`,
        style: {
          fontSize: '9px', fontWeight: 600,
          padding: '1px 5px', borderRadius: '3px',
          backgroundColor: lastRequestUsage.completionTokens > 8000 ? '#fef2f2' : '#fffbeb',
          color: lastRequestUsage.completionTokens > 8000 ? '#dc2626' : '#d97706',
          border: `1px solid ${lastRequestUsage.completionTokens > 8000 ? '#fecaca' : '#fed7aa'}`,
          whiteSpace: 'nowrap' as const,
        },
      }, `OUT ${Math.round(lastRequestUsage.completionTokens / 163.84)}%`),
      React.createElement('button', {
        onClick: () => setShowDebug(d => !d),
        style: {
          fontSize: '11px', fontWeight: 500,
          padding: '2px 6px', borderRadius: '4px',
          backgroundColor: showDebug ? '#fef2f2' : '#f9fafb',
          color: showDebug ? '#dc2626' : '#6b7280',
          border: `1px solid ${showDebug ? '#fecaca' : '#e5e7eb'}`,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
        },
      }, showDebug ? 'Hide Debug' : 'Debug')
    ),

    // Debug: Rewind & Reissue
    showDebug && canRewind && React.createElement('div', {
      style: {
        margin: '0 24px 6px', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          fontSize: '10px', color: '#888',
          textTransform: 'uppercase' as const, letterSpacing: '0.05em',
        },
      }, 'Rewind & Reissue'),
      React.createElement('div', {
        style: {
          padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center',
          flexWrap: 'wrap' as const,
        },
      },
        // Model picker
        rewindModels && rewindModels.length > 1 && React.createElement('select', {
          value: rewindModel ?? currentModel ?? '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setRewindModel(e.target.value),
          style: {
            padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
            fontFamily: 'Consolas, "Courier New", monospace',
            backgroundColor: '#2a2a2a', color: '#d4d4d4',
            border: '1px solid #555', cursor: 'pointer',
          },
        },
          ...rewindModels.map(m =>
            React.createElement('option', { key: m, value: m }, m)
          )
        ),
        // Current model label when no picker
        rewindModels && rewindModels.length <= 1 && currentModel && React.createElement('span', {
          style: { fontSize: '11px', color: '#888', fontFamily: 'Consolas, "Courier New", monospace' },
        }, currentModel),
        // Rewind button
        React.createElement('button', {
          onClick: () => {
            const override = rewindModel && rewindModel !== currentModel ? rewindModel : undefined;
            onRewind!(override);
          },
          style: {
            padding: '4px 12px', borderRadius: '4px', border: 'none',
            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            backgroundColor: '#3b82f6', color: '#fff',
            display: 'flex', alignItems: 'center', gap: '4px',
          },
        },
          '\u21A9',
          rewindModel && rewindModel !== currentModel
            ? `Rewind & retry with ${rewindModel}`
            : 'Rewind & retry'
        ),
      )
    ),

    // Debug: Component tree for last 3 turns (collapsible)
    showDebug && turns.length > 0 && React.createElement('details', {
      style: {
        margin: '0 24px 6px', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('summary', {
        style: {
          padding: '8px 12px',
          fontSize: '10px', color: '#888',
          textTransform: 'uppercase' as const, letterSpacing: '0.05em',
          cursor: 'pointer', userSelect: 'none' as const,
          listStyle: 'none',
        },
      }, '\u25B6 Component Tree (last ' + Math.min(turns.length, 3) + ' turn' + (Math.min(turns.length, 3) > 1 ? 's' : '') + ')'),
      ...turns.slice(-3).map((turn, ti) =>
        React.createElement('div', { key: 'tree-' + ti },
          turns.length > 1 && React.createElement('div', {
            style: {
              padding: '4px 12px 2px', fontSize: '10px', color: '#6a9955',
              fontFamily: 'Consolas, "Courier New", monospace',
              borderTop: '1px solid #333',
            },
          }, '\u2500\u2500 Turn ' + (turns.length - Math.min(turns.length, 3) + ti + 1) + (ti === turns.slice(-3).length - 1 ? ' (current)' : '')),
          React.createElement('div', {
            style: {
              padding: '6px 12px 10px', fontSize: '11px',
              fontFamily: 'Consolas, "Courier New", monospace',
              maxHeight: '200px', overflow: 'auto',
              color: '#d4d4d4',
            },
          },
            ...extractComponentTree(turn.agentSpec.layout).map((entry, i) =>
              React.createElement('div', {
                key: i,
                style: {
                  paddingLeft: (entry.depth * 16) + 'px',
                  padding: '1px 0 1px ' + (entry.depth * 16) + 'px',
                  display: 'flex', gap: '6px', alignItems: 'baseline',
                },
              },
                React.createElement('span', {
                  style: { color: '#569cd6', fontWeight: 600 },
                }, entry.type),
                entry.props.length > 0 && React.createElement('span', {
                  style: { color: '#9cdcfe', fontSize: '10px' },
                }, entry.props.join(' '))
              )
            )
          )
        )
      )
    ),

    // Debug: API request log
    showDebug && React.createElement('div', {
      style: {
        margin: '0 24px 8px', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          fontSize: '10px', color: '#888',
        },
      },
        React.createElement('span', {
          style: { textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
        }, `API Requests (${apiRequests.length})`),
        React.createElement('button', {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            navigator.clipboard.writeText(apiRequests.map(r =>
              `${r.method} ${r.url} → ${r.status} (${r.duration}ms)${r.bodyPreview ? '\n' + r.bodyPreview : ''}`
            ).join('\n\n'));
          },
          title: 'Copy to clipboard',
          style: { background: 'none', border: 'none', color: '#aaa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
        }, '\u2398')
      ),
      React.createElement('div', {
        style: {
          padding: '6px 12px 10px', fontSize: '11px',
          fontFamily: 'Consolas, "Courier New", monospace',
          maxHeight: '300px', overflow: 'auto',
        },
      },
        apiRequests.length > 0
          ? apiRequests.slice(-30).map((req) =>
          React.createElement('div', {
            key: req.id,
            style: {
              padding: '4px 0',
              borderBottom: '1px solid #2a2a2a',
              cursor: 'pointer',
            },
            onClick: () => setExpandedRequestId(prev => prev === req.id ? null : req.id),
          },
            React.createElement('div', {
              style: { display: 'flex', gap: '8px', alignItems: 'center', color: '#d4d4d4' },
            },
              React.createElement('span', {
                style: {
                  fontSize: '9px', fontWeight: 600, padding: '1px 5px',
                  borderRadius: '3px', flexShrink: 0,
                  backgroundColor: req.ok ? '#22c55e' : '#ef4444',
                  color: '#fff',
                },
              }, String(req.status)),
              React.createElement('span', {
                style: { fontWeight: 600, color: req.method === 'GET' ? '#60a5fa' : req.method === 'POST' ? '#f59e0b' : req.method === 'PUT' ? '#a78bfa' : req.method === 'DELETE' ? '#ef4444' : '#d4d4d4' },
              }, req.method),
              React.createElement('span', {
                style: { color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 },
              }, req.url),
              React.createElement('span', {
                style: { color: req.duration > 2000 ? '#f59e0b' : '#6b7280', flexShrink: 0, fontSize: '10px' },
              }, req.duration >= 1000 ? (req.duration / 1000).toFixed(1) + 's' : req.duration + 'ms'),
              React.createElement('span', {
                style: { color: '#555', flexShrink: 0, fontSize: '10px' },
              }, new Date(req.time).toLocaleTimeString()),
              React.createElement('span', {
                style: { color: '#555', flexShrink: 0, fontSize: '9px' },
              }, expandedRequestId === req.id ? '\u25BE' : '\u25B8')
            ),
            expandedRequestId === req.id && req.bodyPreview && React.createElement('div', {
              style: {
                marginTop: '4px', padding: '6px 8px', borderRadius: '4px',
                backgroundColor: req.ok ? '#1a2332' : '#2a1215',
                color: req.ok ? '#93c5fd' : '#fca5a5',
                fontSize: '10px', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
                maxHeight: '200px', overflow: 'auto',
                fontFamily: 'Consolas, "Courier New", monospace',
              },
            }, (() => {
              try {
                return JSON.stringify(JSON.parse(req.bodyPreview!), null, 2);
              } catch { return req.bodyPreview; }
            })()),
            expandedRequestId === req.id && !req.bodyPreview && React.createElement('div', {
              style: {
                marginTop: '4px', padding: '4px 8px', fontSize: '10px', color: '#555',
              },
            }, 'No response body captured')
          )
        )
          : [React.createElement('span', { key: 'empty', style: { color: '#555' } }, 'No requests yet')]
      )
    )
    ) // end fixed bottom bar
  );
}
