import React, { useEffect, useRef, useState, memo } from 'react';
import type { ConversationTurn } from '../schema';
import { AdaptiveRenderer } from '../renderer';
import { useAdaptive } from '../context';

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
  return React.createElement('img', {
    src: iconBrainSparkle, alt: 'AI',
    className: 'adaptive-icon',
    style: {
      width: '28px', height: '28px', borderRadius: '50%',
      padding: '4px', backgroundColor: 'var(--adaptive-primary, #2563eb)',
      flexShrink: 0,
    },
  });
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
          }, turn.agentSpec.agentMessage)
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
          }, turn.agentSpec.agentMessage)
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
  tokenUsage: { promptTokens: number; completionTokens: number };
  lastRequestUsage: { promptTokens: number; completionTokens: number };
}

export function ConversationThread({ turns, isLoading, tokenUsage, lastRequestUsage }: ConversationThreadProps) {
  const { resetSession } = useAdaptive();
  const bottomRef = useRef<HTMLDivElement>(null);

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
      (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0) &&
        React.createElement('span', {
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
    ),

    React.createElement('div', { ref: bottomRef })
  );
}
