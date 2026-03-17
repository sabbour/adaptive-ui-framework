import React, { useEffect, useRef, useState, memo, useSyncExternalStore } from 'react';
import type { ConversationTurn } from '../schema';
import type { DecisionEntry } from '../decision-log';
import { AdaptiveRenderer } from '../renderer';
import { useAdaptive } from '../context';
import { simpleMarkdown } from './builtins';
import { getCompletedRequests, subscribeCompleted, type CompletedRequest } from '../request-tracker';

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
              padding: '8px 14px', borderRadius: '4px 16px 16px 16px',
              backgroundColor: 'var(--adaptive-surface, #fff)',
              border: '1px solid #e5e7eb', fontSize: '14px', lineHeight: '1.6', maxWidth: '80%',
            } as React.CSSProperties,
            dangerouslySetInnerHTML: { __html: simpleMarkdown(turn.agentSpec.agentMessage) },
          })
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
          color: '#fff', fontSize: '14px', lineHeight: '1.5',
        } as React.CSSProperties,
      }, turn.userMessage)
    )
  );
});

// ─── Active Turn ───
// The latest turn with interactive UI + escape hatch text input.
// Collapses to a summary once the user submits/proceeds.
function ActiveTurn({ turn }: { turn: ConversationTurn }) {
  const { sendPrompt, state, isLoading } = useAdaptive();
  const [escapeText, setEscapeText] = useState('');
  const [escapeOpen, setEscapeOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Collapse if submitted locally OR if a prompt was sent via another path (e.g. chatInput)
  const isCollapsed = submitted || !!turn.userMessage || isLoading;

  // Wrap sendPrompt to collapse on submit
  const handleSend = (text: string) => {
    setSubmitted(true);
    sendPrompt(text);
  };

  const handleEscapeSend = () => {
    const text = escapeText.trim();
    if (!text) return;
    setEscapeText('');
    setEscapeOpen(false);
    handleSend(text);
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
              padding: '8px 14px', borderRadius: '4px 16px 16px 16px',
              backgroundColor: 'var(--adaptive-surface, #fff)',
              border: '1px solid #e5e7eb', fontSize: '14px', lineHeight: '1.6', maxWidth: '80%',
            } as React.CSSProperties,
            dangerouslySetInnerHTML: { __html: simpleMarkdown(turn.agentSpec.agentMessage) },
          })
        ),

        // ── Collapsed (after submit) or interactive UI ──
        isCollapsed
          ? null
          : React.createElement(React.Fragment, null,
              // Interactive UI
              React.createElement('div', {
                style: { marginLeft: '38px', marginBottom: '8px' },
              },
                React.createElement(ActiveTurnUI, { node: turn.agentSpec.layout, onSend: handleSend })
              ),

              // Escape hatch
              React.createElement('div', {
                style: { marginLeft: '38px', marginTop: '12px' },
              },
                !escapeOpen
                  ? React.createElement('button', {
                      onClick: () => setEscapeOpen(true),
                      style: {
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '12px', color: 'var(--adaptive-text-secondary)', padding: '4px 0',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      },
                    },
                      React.createElement('img', { src: iconCommentEdit, alt: '', width: 14, height: 14, style: { opacity: 0.5 } }),
                      ' Type instead...'
                    )
                  : React.createElement('div', {
                      style: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
                    },
                      React.createElement('textarea', {
                        value: escapeText,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setEscapeText(e.target.value),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEscapeSend();
                          }
                          if (e.key === 'Escape') {
                            setEscapeOpen(false);
                            setEscapeText('');
                          }
                        },
                        placeholder: "Can't fill the form? Describe what you need instead...",
                        rows: 2, autoFocus: true,
                        style: {
                          flex: 1, padding: '8px 10px', borderRadius: '8px',
                          fontSize: '13px', fontFamily: 'inherit', minHeight: '40px',
                        },
                      }),
                      React.createElement('button', {
                        onClick: handleEscapeSend,
                        disabled: !escapeText.trim(),
                        style: {
                          padding: '8px 14px', borderRadius: 'var(--adaptive-radius)',
                          border: 'none', fontSize: '13px', fontWeight: 500,
                          cursor: escapeText.trim() ? 'pointer' : 'default',
                          backgroundColor: 'var(--adaptive-primary)',
                          color: '#fff',
                          opacity: escapeText.trim() ? 1 : 0.5,
                          flexShrink: 0, alignSelf: 'flex-end',
                        },
                      }, 'Send')
                    )
              )
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
          color: '#fff', fontSize: '14px', lineHeight: '1.5',
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
  useIntents?: boolean;
  onToggleIntentMode?: () => void;
  lastRawResponse?: string | null;
  lastRawRequest?: string | null;
  lastDecisionLog?: DecisionEntry[];
}

export function ConversationThread({ turns, isLoading, error, tokenUsage, lastRequestUsage, useIntents, onToggleIntentMode, lastRawResponse, lastRawRequest, lastDecisionLog }: ConversationThreadProps) {
  const { resetSession } = useAdaptive();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(true);
  const [decisionsOpen, setDecisionsOpen] = useState(true);
  const [armLogOpen, setArmLogOpen] = useState(true);
  const armRequests = useSyncExternalStore(subscribeCompleted, getCompletedRequests);

  // Track data versions for ping animation
  const [requestPing, setRequestPing] = useState(false);
  const [responsePing, setResponsePing] = useState(false);
  const [decisionsPing, setDecisionsPing] = useState(false);
  const [armPing, setArmPing] = useState(false);
  const prevRequestRef = useRef(lastRawRequest);
  const prevResponseRef = useRef(lastRawResponse);
  const prevDecisionsRef = useRef(lastDecisionLog?.length ?? 0);
  const prevArmRef = useRef(armRequests.length);

  useEffect(() => {
    if (lastRawRequest && lastRawRequest !== prevRequestRef.current) {
      setRequestPing(true);
      setTimeout(() => setRequestPing(false), 1500);
    }
    prevRequestRef.current = lastRawRequest;
  }, [lastRawRequest]);

  useEffect(() => {
    if (lastRawResponse && lastRawResponse !== prevResponseRef.current) {
      setResponsePing(true);
      setTimeout(() => setResponsePing(false), 1500);
    }
    prevResponseRef.current = lastRawResponse;
  }, [lastRawResponse]);

  useEffect(() => {
    const len = lastDecisionLog?.length ?? 0;
    if (len > 0 && len !== prevDecisionsRef.current) {
      setDecisionsPing(true);
      setTimeout(() => setDecisionsPing(false), 1500);
    }
    prevDecisionsRef.current = len;
  }, [lastDecisionLog]);

  useEffect(() => {
    if (armRequests.length > 0 && armRequests.length !== prevArmRef.current) {
      setArmPing(true);
      setTimeout(() => setArmPing(false), 1500);
    }
    prevArmRef.current = armRequests.length;
  }, [armRequests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, isLoading]);

  const showReset = turns.length > 1 || (turns.length === 1 && turns[0].userMessage);

  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', gap: '0',
      flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 0',
    } as React.CSSProperties,
  },
    // Past turns (memoized)
    ...turns.slice(0, -1).map((turn) =>
      React.createElement(PastTurn, { key: turn.id, turn })
    ),

    // Active turn
    turns.length > 0 && React.createElement(ActiveTurn, {
      key: turns[turns.length - 1].id,
      turn: turns[turns.length - 1],
    }),

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
        color: '#991b1b', fontSize: '13px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      },
    },
      React.createElement('span', { style: { fontSize: '16px', lineHeight: 1, flexShrink: 0 } }, '⚠'),
      React.createElement('div', null,
        React.createElement('strong', null, 'Error: '),
        error,
        error.includes('finish_reason=length') && React.createElement('div', {
          style: { marginTop: '6px', fontSize: '12px', color: '#b91c1c' },
        }, 'The LLM ran out of output tokens. Try resetting the chat or switch to Intent mode for smaller payloads.')
      )
    ),

    // Reset session button + token counter
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '8px 24px 0' },
    },
      showReset && React.createElement('button', {
        onClick: resetSession,
        title: 'Reset chat session',
        style: {
          display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
          borderRadius: 'var(--adaptive-radius, 8px)', padding: '4px 10px',
          fontSize: '12px', color: 'var(--adaptive-text-secondary, #6b7280)',
          cursor: 'pointer',
        },
      },
        React.createElement('img', {
          src: iconArrowReset, alt: '', width: 14, height: 14,
          style: { opacity: 0.6 },
        }),
        'New chat'
      ),
      (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0)
        ? React.createElement('span', {
            title: `Last request — Input: ${lastRequestUsage.promptTokens.toLocaleString()} / Output: ${lastRequestUsage.completionTokens.toLocaleString()}\nTotal — Input: ${tokenUsage.promptTokens.toLocaleString()} / Output: ${tokenUsage.completionTokens.toLocaleString()}`,
            style: {
              fontSize: '11px', color: 'var(--adaptive-text-secondary, #6b7280)',
              fontFamily: 'monospace', whiteSpace: 'nowrap',
            },
          },
            `▲ ${lastRequestUsage.promptTokens.toLocaleString()}  ▼ ${lastRequestUsage.completionTokens.toLocaleString()}`,
            React.createElement('span', {
              style: { margin: '0 6px', color: 'var(--adaptive-border, #d1d5db)' },
            }, '│'),
            `Σ ${tokenUsage.promptTokens.toLocaleString()} / ${tokenUsage.completionTokens.toLocaleString()}`
          )
        : React.createElement('span', {
            style: {
              fontSize: '11px', color: 'var(--adaptive-text-secondary, #6b7280)',
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
        onClick: onToggleIntentMode,
        title: useIntents
          ? 'Intent mode: LLM outputs semantic intents, client resolves to UI. Click to switch to Adaptive mode.'
          : 'Adaptive mode: LLM outputs full UI specs directly. Click to switch to Intent mode.',
        style: {
          fontSize: '10px', fontWeight: 500,
          padding: '2px 6px', borderRadius: '4px',
          backgroundColor: useIntents ? '#eff6ff' : '#f3e8ff',
          color: useIntents ? '#2563eb' : '#7c3aed',
          border: `1px solid ${useIntents ? '#bfdbfe' : '#ddd6fe'}`,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
        },
      }, useIntents ? 'Mode: Intent' : 'Mode: Adaptive'),
      React.createElement('button', {
        onClick: () => setShowDebug(d => !d),
        style: {
          fontSize: '10px', fontWeight: 500,
          padding: '2px 6px', borderRadius: '4px',
          backgroundColor: showDebug ? '#fef2f2' : '#f9fafb',
          color: showDebug ? '#dc2626' : '#6b7280',
          border: `1px solid ${showDebug ? '#fecaca' : '#e5e7eb'}`,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
        },
      }, showDebug ? 'Hide Debug' : 'Debug'),
      React.createElement('button', {
        onClick: () => {
          const current = document.documentElement.getAttribute('data-theme');
          const next = current === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('adaptive-ui-theme', next); } catch {}
        },
        title: 'Toggle dark/light theme',
        style: {
          fontSize: '10px', fontWeight: 500,
          padding: '2px 6px', borderRadius: '4px',
          backgroundColor: '#f9fafb',
          color: '#6b7280',
          border: '1px solid #e5e7eb',
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
        },
      }, '\u263D')
    ),

    // Debug panel — raw LLM request
    showDebug && React.createElement('div', {
      style: {
        margin: '0 24px 8px', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', cursor: 'pointer',
          backgroundColor: '#1e1e1e', borderBottom: requestOpen ? '1px solid #333' : 'none',
          borderRadius: requestOpen ? '8px 8px 0 0' : '8px',
          fontSize: '10px', color: requestPing ? '#60a5fa' : '#888',
          transition: 'color 0.3s ease',
        },
        onClick: () => setRequestOpen(o => !o),
      },
        React.createElement('span', {
          style: { textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
        }, `${requestOpen ? '▾' : '▸'} Last LLM Raw Request`),
        lastRawRequest && React.createElement('button', {
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); navigator.clipboard.writeText(lastRawRequest!); },
          title: 'Copy to clipboard',
          style: { background: 'none', border: 'none', color: '#aaa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
        }, '\u2398')
      ),
      requestOpen && React.createElement('div', {
        style: {
          padding: '8px 12px 12px', fontSize: '11px', color: '#d4d4d4',
          fontFamily: 'Consolas, "Courier New", monospace',
          maxHeight: '260px', overflow: 'auto',
          whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
        },
      }, lastRawRequest || React.createElement('span', { style: { color: '#555' } }, 'No request yet'))
    ),

    // Debug panel — raw LLM response
    showDebug && React.createElement('div', {
      style: {
        margin: '0 24px', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', cursor: 'pointer',
          backgroundColor: '#1e1e1e', borderBottom: responseOpen ? '1px solid #333' : 'none',
          borderRadius: responseOpen ? '8px 8px 0 0' : '8px',
          fontSize: '10px', color: responsePing ? '#60a5fa' : '#888',
          transition: 'color 0.3s ease',
        },
        onClick: () => setResponseOpen(o => !o),
      },
        React.createElement('span', {
          style: { textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
        }, `${responseOpen ? '▾' : '▸'} Last LLM Raw Response`),
        lastRawResponse && React.createElement('button', {
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); navigator.clipboard.writeText((() => { try { return JSON.stringify(JSON.parse(lastRawResponse!), null, 2); } catch { return lastRawResponse!; } })()); },
          title: 'Copy to clipboard',
          style: { background: 'none', border: 'none', color: '#aaa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
        }, '\u2398')
      ),
      responseOpen && React.createElement('div', {
        style: {
          padding: '8px 12px 12px', fontSize: '11px', color: '#d4d4d4',
          fontFamily: 'Consolas, "Courier New", monospace',
          maxHeight: '260px', overflow: 'auto',
          whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
        },
      },
        lastRawResponse
          ? (() => { try { return JSON.stringify(JSON.parse(lastRawResponse), null, 2); } catch { return lastRawResponse; } })()
          : React.createElement('span', { style: { color: '#555' } }, 'No response yet')
      )
    ),

    // Debug panel — logical decisions
    showDebug && React.createElement('div', {
      style: {
        margin: '8px 24px 0', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', cursor: 'pointer',
          backgroundColor: '#1e1e1e', borderBottom: decisionsOpen ? '1px solid #333' : 'none',
          borderRadius: decisionsOpen ? '8px 8px 0 0' : '8px',
          fontSize: '10px', color: decisionsPing ? '#a78bfa' : '#888',
          transition: 'color 0.3s ease',
        },
        onClick: () => setDecisionsOpen(o => !o),
      },
        React.createElement('span', {
          style: { textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
        }, `${decisionsOpen ? '\u25BE' : '\u25B8'} Logical Decisions (${lastDecisionLog?.length ?? 0})`),
        (lastDecisionLog && lastDecisionLog.length > 0) && React.createElement('button', {
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); navigator.clipboard.writeText(lastDecisionLog!.map(d => `[${d.stage}] ${d.message}`).join('\n')); },
          title: 'Copy to clipboard',
          style: { background: 'none', border: 'none', color: '#aaa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
        }, '\u2398')
      ),
      decisionsOpen && React.createElement('div', {
        style: {
          padding: '8px 12px 12px', fontSize: '11px',
          fontFamily: 'Consolas, "Courier New", monospace',
          maxHeight: '260px', overflow: 'auto',
        },
      },
        lastDecisionLog && lastDecisionLog.length > 0
          ? lastDecisionLog.map((entry, i) => {
          const stageColors: Record<string, string> = { adapter: '#60a5fa', intent: '#a78bfa', renderer: '#34d399' };
          return React.createElement('div', {
            key: i,
            style: {
              display: 'flex', gap: '8px', padding: '2px 0',
              color: '#d4d4d4', lineHeight: '1.5',
            },
          },
            React.createElement('span', {
              style: {
                fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' as const,
                padding: '1px 5px', borderRadius: '3px', flexShrink: 0, alignSelf: 'flex-start',
                backgroundColor: stageColors[entry.stage] ?? '#888',
                color: '#1e1e1e', marginTop: '2px',
              },
            }, entry.stage),
            React.createElement('span', null, entry.message)
          );
        })
          : [React.createElement('span', { key: 'empty', style: { color: '#555' } }, 'No decisions yet')]
      )
    ),

    // Debug panel — ARM API requests
    showDebug && React.createElement('div', {
      style: {
        margin: '8px 24px 0', borderRadius: '8px', border: '1px solid #333',
        backgroundColor: '#1e1e1e',
      },
    },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', cursor: 'pointer',
          backgroundColor: '#1e1e1e', borderBottom: armLogOpen ? '1px solid #333' : 'none',
          borderRadius: armLogOpen ? '8px 8px 0 0' : '8px',
          fontSize: '10px', color: armPing ? '#34d399' : '#888',
          transition: 'color 0.3s ease',
        },
        onClick: () => setArmLogOpen(o => !o),
      },
        React.createElement('span', {
          style: { textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
        }, `${armLogOpen ? '\u25BE' : '\u25B8'} ARM API Requests (${armRequests.length})`),
        React.createElement('button', {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            navigator.clipboard.writeText(armRequests.map(r =>
              `${r.method} ${r.url} → ${r.status} (${r.duration}ms)${r.bodyPreview ? '\n' + r.bodyPreview : ''}`
            ).join('\n\n'));
          },
          title: 'Copy to clipboard',
          style: { background: 'none', border: 'none', color: '#aaa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
        }, '\u2398')
      ),
      armLogOpen && React.createElement('div', {
        style: {
          padding: '8px 12px 12px', fontSize: '11px',
          fontFamily: 'Consolas, "Courier New", monospace',
          maxHeight: '300px', overflow: 'auto',
        },
      },
        armRequests.length > 0
          ? armRequests.slice(-20).map((req, i) =>
          React.createElement('div', {
            key: req.id,
            style: {
              padding: '4px 0',
              borderBottom: i < armRequests.length - 1 ? '1px solid #333' : 'none',
            },
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
                style: { fontWeight: 600, color: req.method === 'GET' ? '#60a5fa' : '#f59e0b' },
              }, req.method),
              React.createElement('span', {
                style: { color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
              }, req.url),
              React.createElement('span', {
                style: { color: '#6b7280', flexShrink: 0 },
              }, `${req.duration}ms`)
            ),
            !req.ok && req.bodyPreview && React.createElement('div', {
              style: {
                marginTop: '4px', padding: '4px 8px', borderRadius: '4px',
                backgroundColor: '#2a1215', color: '#fca5a5',
                fontSize: '10px', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
                maxHeight: '80px', overflow: 'auto',
              },
            }, (() => {
              try {
                const parsed = JSON.parse(req.bodyPreview!);
                return parsed?.error?.message ?? req.bodyPreview;
              } catch { return req.bodyPreview; }
            })())
          )
        )
          : [React.createElement('span', { key: 'empty', style: { color: '#555' } }, 'No ARM requests yet')]
      )
    ),

    React.createElement('div', { ref: bottomRef })
  );
}
