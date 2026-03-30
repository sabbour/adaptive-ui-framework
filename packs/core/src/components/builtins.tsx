import React, { useState, useRef, useEffect } from 'react';
import type { AdaptiveComponentProps } from '../registry';
import { registerComponents } from '../registry';
import { renderChildren, AdaptiveRenderer } from '../renderer';
import { useAdaptive } from '../context';

// ─── Input placeholder defaults registry ───
// When an input has a placeholder like "e.g. my-app", the example value is
// registered here. On form submit, empty fields are backfilled from this map.
const placeholderDefaults = new Map<string, string>();

/** Strip common example prefixes from a placeholder to extract the default value. */
function extractDefault(placeholder: string): string {
  return placeholder.replace(/^e\.?g\.?\s*/i, '').replace(/^ex\.\s*/i, '').trim();
}

/** Get placeholder defaults for all registered inputs (and clear the registry). */
export function consumePlaceholderDefaults(): Map<string, string> {
  const copy = new Map(placeholderDefaults);
  return copy;
}

// ─── Searchable Dropdown (shared) ───
export interface SearchableDropdownOption {
  value: string;
  label: string;
}

export function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder,
  className,
  style,
}: {
  options: SearchableDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return React.createElement('div', {
    ref: containerRef,
    style: { position: 'relative', ...style } as React.CSSProperties,
    className,
  },
    // Trigger button
    React.createElement('button', {
      type: 'button',
      onClick: () => { setOpen(!open); setSearch(''); },
      style: {
        width: '100%', padding: '0 8px', borderRadius: 'var(--adaptive-radius, 2px)',
        border: '1px solid #8a8886', fontSize: 'var(--adaptive-fs-base, 13px)',
        backgroundColor: '#fff', cursor: 'pointer',
        textAlign: 'left' as const, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        height: '32px', lineHeight: '20px',
        fontFamily: 'var(--adaptive-font)',
        color: 'var(--adaptive-text, #292827)',
      },
    },
      React.createElement('span', {
        style: selectedLabel ? { color: 'var(--adaptive-text, #292827)' } : { color: '#a19f9d' },
      }, selectedLabel || placeholder || 'Select...'),
      React.createElement('span', { style: { fontSize: '10px', marginLeft: '8px', color: '#605e5c' } }, open ? '\u25B2' : '\u25BC')
    ),
    // Dropdown panel
    open && React.createElement('div', {
      style: {
        position: 'absolute', top: '100%', left: 0, right: 0,
        marginTop: '2px', backgroundColor: '#fff',
        border: '1px solid var(--adaptive-border, #e1dfdd)', borderRadius: 'var(--adaptive-radius, 2px)',
        boxShadow: '0 3.2px 7.2px rgba(0,0,0,.132), 0 .6px 1.8px rgba(0,0,0,.108)',
        zIndex: 1000, maxHeight: '240px', display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties,
    },
      // Search input
      React.createElement('input', {
        type: 'text',
        value: search,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
        placeholder: 'Filter...',
        autoFocus: true,
        style: {
          padding: '0 8px', border: 'none', height: '32px',
          borderBottom: '1px solid var(--adaptive-border, #e1dfdd)', fontSize: 'var(--adaptive-fs-base, 13px)',
          outline: 'none', boxShadow: 'none',
          borderRadius: 'var(--adaptive-radius, 2px) var(--adaptive-radius, 2px) 0 0',
          fontFamily: 'var(--adaptive-font)',
          color: 'var(--adaptive-text, #292827)',
        },
      }),
      // Options list
      React.createElement('div', {
        style: { overflowY: 'auto', maxHeight: '200px' } as React.CSSProperties,
      },
        filtered.length === 0
          ? React.createElement('div', {
              style: { padding: '7px 10px', color: '#a19f9d', fontSize: '13px' },
            }, 'No matches')
          : filtered.map((opt, idx) =>
              React.createElement('div', {
                key: opt.value + '-' + idx,
                onClick: () => { onChange(opt.value); setOpen(false); setSearch(''); },
                style: {
                  padding: '7px 10px', cursor: 'pointer', fontSize: '13px',
                  backgroundColor: opt.value === value ? '#e6f2ff' : 'transparent',
                  fontWeight: opt.value === value ? 600 : 400,
                  color: 'var(--adaptive-text, #292827)',
                  borderBottom: '1px solid var(--adaptive-border, #e1dfdd)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f3f2f1';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = opt.value === value ? '#e6f2ff' : 'transparent';
                },
              }, opt.label)
            )
      )
    )
  );
}
import { sanitizeUrl } from '../sanitize';
import { upsertArtifact } from '../artifacts';
import type {
  TextNode, ButtonNode, InputNode, SelectNode, ImageNode,
  ContainerNode, ColumnsNode, CardNode, ListNode, TableNode, FormNode,
  TabsNode, ProgressNode, AlertNode, ChatInputNode, MarkdownNode,
  RadioGroupNode, MultiSelectNode, ComboboxNode, QuestionnaireNode, ToggleNode, SliderNode,
  DividerNode, BadgeNode, AccordionNode, CodeBlockNode, LinkNode,
  AdaptiveValue,
} from '../schema';

// ─── Text ───
function TextComponent({ node }: AdaptiveComponentProps<TextNode>) {
  const variantMap: Record<string, keyof JSX.IntrinsicElements> = {
    h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4',
    body: 'p', caption: 'span', code: 'code',
  };
  const Tag = variantMap[node.variant ?? 'body'] ?? 'p';
  const variantStyles: Record<string, React.CSSProperties> = {
    h1: { fontSize: '24px', fontWeight: 600, margin: '0 0 0.4em' },
    h2: { fontSize: '20px', fontWeight: 600, margin: '0 0 0.3em' },
    h3: { fontSize: '16px', fontWeight: 600, margin: '0 0 0.2em' },
    h4: { fontSize: '14px', fontWeight: 600, margin: '0 0 0.15em' },
    body: { fontSize: '13px', margin: '0 0 0.4em' },
    caption: { fontSize: '12px', color: 'var(--adaptive-text-secondary, #646464)' },
    code: { fontFamily: 'monospace', backgroundColor: '#f3f2f1', padding: '2px 6px', borderRadius: '2px' },
  };
  return React.createElement(Tag, {
    style: { ...variantStyles[node.variant ?? 'body'], ...node.style } as React.CSSProperties,
    className: node.className,
  }, node.content);
}

// ─── Button ───
function ButtonComponent({ node }: AdaptiveComponentProps<ButtonNode>) {
  const { handleAction } = useAdaptive();
  const resolvedAction = (node as unknown as { onClick?: unknown; action?: unknown; onPress?: unknown }).onClick
    ?? (node as unknown as { action?: unknown }).action
    ?? (node as unknown as { onPress?: unknown }).onPress;
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: 'var(--adaptive-primary, #0078d4)', color: '#fff', border: '1px solid var(--adaptive-primary, #0078d4)' },
    secondary: { backgroundColor: '#fff', color: 'var(--adaptive-text, #323130)', border: '1px solid #8a8886' },
    danger: { backgroundColor: '#c32727', color: '#fff', border: '1px solid #c32727' },
    ghost: { backgroundColor: 'transparent', color: 'inherit', border: 'none' },
  };
  return React.createElement('button', {
    style: {
      padding: '0 20px', borderRadius: 'var(--adaptive-radius, 2px)', cursor: 'pointer', fontSize: 'var(--adaptive-fs-base, 13px)',
      fontWeight: 600, transition: 'background 150ms ease', marginTop: '4px',
      height: '32px', lineHeight: '20px',
      fontFamily: 'var(--adaptive-font)',
      ...variantStyles[node.variant ?? 'primary'],
      ...node.style,
    } as React.CSSProperties,
    className: node.className,
    disabled: typeof node.disabled === 'boolean' ? node.disabled : false,
    onClick: () => {
      if (resolvedAction && typeof resolvedAction === 'object') {
        handleAction(resolvedAction as ButtonNode['onClick']);
        return;
      }
      handleAction({ type: 'sendPrompt', prompt: node.label });
    },
  }, node.label);
}

// ─── Input ───
function InputComponent({ node }: AdaptiveComponentProps<InputNode>) {
  const { state, dispatch, disabled } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';
  const isTextarea = node.inputType === 'textarea';
  const Tag = isTextarea ? 'textarea' : 'input';

  // Register placeholder as a default value for empty-field backfill on submit
  useEffect(() => {
    if (disabled) return;
    if (node.placeholder && node.bind) {
      const def = extractDefault(node.placeholder);
      if (def) placeholderDefaults.set(node.bind, def);
      return () => { placeholderDefaults.delete(node.bind); };
    }
  }, [node.bind, node.placeholder, disabled]);

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #292827)' },
    }, node.label),
    React.createElement(Tag, {
      type: isTextarea ? undefined : (node.inputType ?? 'text'),
      placeholder: node.placeholder,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        dispatch({ type: 'SET', key: node.bind, value: e.target.value });
      },
      style: {
        width: '100%', padding: '0 8px', borderRadius: 'var(--adaptive-radius, 2px)',
        border: '1px solid #8a8886', fontSize: 'var(--adaptive-fs-base, 13px)',
        boxSizing: 'border-box' as const,
        height: isTextarea ? undefined : '32px', lineHeight: '20px',
        fontFamily: 'var(--adaptive-font)',
        color: 'var(--adaptive-text, #292827)',
        ...(isTextarea ? { minHeight: '80px', resize: 'vertical' as const, padding: '4px 8px' } : {}),
      },
      className: node.className,
    })
  );
}

// ─── Select ───
function SelectComponent({ node }: AdaptiveComponentProps<SelectNode>) {
  const { state, dispatch } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';
  const options = (Array.isArray(node.options) ? node.options : []).map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #292827)' },
    }, node.label),
    React.createElement(SearchableDropdown, {
      options,
      value,
      onChange: (v: string) => dispatch({ type: 'SET', key: node.bind, value: v }),
      className: node.className,
    })
  );
}

// ─── Combobox ───
// A dropdown that also allows typing a custom value not in the options list.
function ComboboxComponent({ node }: AdaptiveComponentProps<ComboboxNode>) {
  const { state, dispatch } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';
  const allowCustom = node.allowCustom !== false; // default true
  const options = Array.isArray(node.options) ? node.options : [];

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';
  // Show the raw value if it doesn't match any option (custom typed value)
  const displayValue = selectedLabel || value;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (v: string) => {
    dispatch({ type: 'SET', key: node.bind, value: v });
    setOpen(false);
    setSearch('');
  };

  const handleCustomSubmit = () => {
    if (search.trim()) {
      dispatch({ type: 'SET', key: node.bind, value: search.trim() });
      setOpen(false);
      setSearch('');
    }
  };

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #292827)' },
    }, node.label),
    React.createElement('div', {
      ref: containerRef,
      style: { position: 'relative' } as React.CSSProperties,
    },
      // Trigger button
      React.createElement('button', {
        type: 'button',
        onClick: () => { setOpen(!open); setSearch(''); },
        style: {
          width: '100%', padding: '0 8px', borderRadius: 'var(--adaptive-radius, 2px)',
          border: '1px solid #8a8886', fontSize: 'var(--adaptive-fs-base, 13px)',
          backgroundColor: '#fff', cursor: 'pointer',
          textAlign: 'left' as const, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          height: '32px', lineHeight: '20px',
          fontFamily: 'var(--adaptive-font)',
          color: 'var(--adaptive-text, #292827)',
        },
      },
        React.createElement('span', {
          style: displayValue ? { color: 'var(--adaptive-text, #292827)' } : { color: '#a19f9d' },
        }, displayValue || node.placeholder || 'Select or type...'),
        React.createElement('span', { style: { fontSize: '10px', marginLeft: '8px', color: '#605e5c' } }, open ? '\u25B2' : '\u25BC')
      ),
      // Dropdown panel
      open && React.createElement('div', {
        style: {
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '2px', backgroundColor: '#fff',
          border: '1px solid var(--adaptive-border, #e1dfdd)', borderRadius: 'var(--adaptive-radius, 2px)',
          boxShadow: '0 3.2px 7.2px rgba(0,0,0,.132), 0 .6px 1.8px rgba(0,0,0,.108)',
          zIndex: 1000, maxHeight: '280px', display: 'flex',
          flexDirection: 'column',
        } as React.CSSProperties,
      },
        // Search / custom input
        React.createElement('input', {
          type: 'text',
          value: search,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && allowCustom) handleCustomSubmit();
          },
          placeholder: allowCustom ? 'Search or type a custom value...' : 'Filter...',
          autoFocus: true,
          style: {
            padding: '0 8px', border: 'none', height: '32px',
            borderBottom: '1px solid var(--adaptive-border, #e1dfdd)', fontSize: 'var(--adaptive-fs-base, 13px)',
            outline: 'none', boxShadow: 'none',
            borderRadius: 'var(--adaptive-radius, 2px) var(--adaptive-radius, 2px) 0 0',
            fontFamily: 'var(--adaptive-font)',
            color: 'var(--adaptive-text, #292827)',
          },
        }),
        // Options list
        React.createElement('div', {
          style: { overflowY: 'auto', maxHeight: '200px' } as React.CSSProperties,
        },
          filtered.map((opt) =>
            React.createElement('div', {
              key: opt.value,
              onClick: () => handleSelect(opt.value),
              style: {
                padding: '7px 10px', cursor: 'pointer', fontSize: '13px',
                backgroundColor: opt.value === value ? '#e6f2ff' : 'transparent',
                fontWeight: opt.value === value ? 600 : 400,
                color: 'var(--adaptive-text, #292827)',
                borderBottom: '1px solid var(--adaptive-border, #e1dfdd)',
              },
              onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f3f2f1';
              },
              onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = opt.value === value ? '#e6f2ff' : 'transparent';
              },
            }, opt.label)
          ),
          // Custom value option — shown when search doesn't match any option exactly
          allowCustom && search.trim() && !options.some((o) => o.label.toLowerCase() === search.toLowerCase())
            && React.createElement('div', {
              onClick: handleCustomSubmit,
              style: {
                padding: '7px 10px', cursor: 'pointer', fontSize: '13px',
                borderTop: filtered.length > 0 ? '1px solid var(--adaptive-border, #e1dfdd)' : 'none',
                color: 'var(--adaptive-primary, #0078d4)', fontWeight: 600,
              },
              onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f3f2f1';
              },
              onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              },
            }, 'Use: "' + search.trim() + '"')
        )
      )
    )
  );
}

// ─── Questionnaire ───
// A stepped question card shown one question at a time with radio options + freeform text.
// Inspired by ChatGPT's task intake UI: floating card, step indicator, pagination.
function QuestionnaireComponent({ node }: AdaptiveComponentProps<QuestionnaireNode>) {
  const { state, dispatch, handleAction } = useAdaptive();
  const questions = node.questions || [];
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Keep a ref to handleAction so setTimeout callbacks always use the latest
  // version (which closes over the updated state after React re-renders).
  const handleActionRef = useRef(handleAction);
  handleActionRef.current = handleAction;

  if (dismissed || questions.length === 0) return null;

  const q = questions[step];
  const currentValue = (state[q.bind] as string) ?? '';
  const isLast = step === questions.length - 1;
  const allAnswered = questions.every((qq) => {
    const v = state[qq.bind] as string;
    return v && v.trim() !== '';
  });

  const handleOptionSelect = (value: string) => {
    dispatch({ type: 'SET', key: q.bind, value });
    // Auto-advance to next question after a short delay
    if (!isLast) {
      setTimeout(() => setStep((s) => Math.min(s + 1, questions.length - 1)), 200);
    } else {
      // On last question, auto-submit — check other questions from state,
      // but treat the current question as answered (state hasn't updated yet)
      const othersAnswered = questions.every((qq) => {
        if (qq.bind === q.bind) return true; // this one is being set right now
        const v = state[qq.bind] as string;
        return v && v.trim() !== '';
      });
      if (othersAnswered && value.trim()) {
        setTimeout(() => {
          handleActionRef.current(node.onComplete);
          setDismissed(true);
        }, 300);
      }
    }
  };

  const handleFreeformSubmit = (text: string) => {
    if (!text.trim()) return;
    dispatch({ type: 'SET', key: q.bind, value: text.trim() });
    if (!isLast) {
      setTimeout(() => setStep((s) => Math.min(s + 1, questions.length - 1)), 200);
    } else {
      setTimeout(() => {
        handleActionRef.current(node.onComplete);
        setDismissed(true);
      }, 300);
    }
  };

  return React.createElement('div', {
    style: {
      border: '1px solid var(--adaptive-border, #e1dfdd)',
      borderRadius: '12px',
      backgroundColor: 'var(--adaptive-surface, #fff)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    } as React.CSSProperties,
  },
    // Header: question + step indicator + close
    React.createElement('div', {
      style: {
        padding: '16px 16px 12px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
      },
    },
      // Question text
      React.createElement('div', {
        style: {
          flex: 1, fontSize: '14px', fontWeight: 600,
          color: 'var(--adaptive-text, #292827)', lineHeight: 1.4,
        },
      }, q.question),
      // Step indicator + navigation
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '4px',
          flexShrink: 0, fontSize: '12px', color: 'var(--adaptive-text-secondary, #646464)',
        },
      },
        // Back arrow
        step > 0 && React.createElement('button', {
          onClick: () => setStep((s) => s - 1),
          style: {
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px', fontSize: '14px', color: 'var(--adaptive-text-secondary, #646464)',
            display: 'flex', alignItems: 'center',
          },
          title: 'Previous question',
        }, '\u2039'),
        // Step count
        React.createElement('span', null, (step + 1) + '/' + questions.length),
        // Forward arrow
        !isLast && currentValue && React.createElement('button', {
          onClick: () => setStep((s) => s + 1),
          style: {
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px', fontSize: '14px', color: 'var(--adaptive-text-secondary, #646464)',
            display: 'flex', alignItems: 'center',
          },
          title: 'Next question',
        }, '\u203A'),
        // Close button
        React.createElement('button', {
          onClick: () => setDismissed(true),
          style: {
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px', fontSize: '16px', color: 'var(--adaptive-text-secondary, #646464)',
            display: 'flex', alignItems: 'center', marginLeft: '4px',
          },
          title: 'Dismiss',
        }, '\u00D7')
      )
    ),

    // Radio options
    q.options && q.options.length > 0 && React.createElement('div', {
      style: { padding: '0 16px 8px' } as React.CSSProperties,
    },
      q.options.map((opt) =>
        React.createElement('label', {
          key: opt.value,
          onClick: () => handleOptionSelect(opt.value),
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 0', cursor: 'pointer',
            fontSize: '14px', color: 'var(--adaptive-text, #292827)',
          } as React.CSSProperties,
        },
          // Radio circle
          React.createElement('div', {
            style: {
              width: '18px', height: '18px', borderRadius: '50%',
              border: currentValue === opt.value
                ? '5px solid var(--adaptive-primary, #0078d4)'
                : '2px solid var(--adaptive-border, #8a8886)',
              backgroundColor: 'var(--adaptive-surface, #fff)',
              flexShrink: 0, boxSizing: 'border-box' as const,
              transition: 'border 0.15s',
            },
          }),
          React.createElement('span', null, opt.label)
        )
      )
    ),

    // Freeform text input
    React.createElement(QuestionnaireInput, {
      placeholder: q.freeformPlaceholder || 'Type anything to help me get it right',
      onSubmit: handleFreeformSubmit,
    })
  );
}

// Separate component for the input to manage its own local state
function QuestionnaireInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return React.createElement('div', {
    style: {
      padding: '8px 16px 16px',
    },
  },
    React.createElement('input', {
      type: 'text',
      value: text,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && text.trim()) {
          onSubmit(text.trim());
          setText('');
        }
      },
      placeholder,
      style: {
        width: '100%', padding: '10px 12px',
        borderRadius: '2px',
        border: '1px solid var(--adaptive-border, #e1dfdd)',
        fontSize: '14px', outline: 'none',
        backgroundColor: 'var(--adaptive-bg, #f5f5f5)',
        color: 'var(--adaptive-text, #292827)',
        boxSizing: 'border-box' as const,
      },
    })
  );
}

// ─── Image ───
function ImageComponent({ node }: AdaptiveComponentProps<ImageNode>) {
  return React.createElement('img', {
    src: sanitizeUrl(node.src),
    alt: node.alt ?? '',
    style: { maxWidth: '100%', borderRadius: 'var(--adaptive-radius)', ...node.style } as React.CSSProperties,
    className: node.className,
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
      (e.target as HTMLImageElement).style.display = 'none';
    },
  });
}

// ─── Container ───
function ContainerComponent({ node }: AdaptiveComponentProps<ContainerNode>) {
  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '4px', ...node.style } as React.CSSProperties,
    className: node.className,
  }, ...renderChildren(node.children));
}

// ─── Columns ───
function ColumnsComponent({ node }: AdaptiveComponentProps<ColumnsNode>) {
  const kids = renderChildren(node.children);
  const count = kids.length || 1;
  const gap = node.gap || '16px';

  // Build grid-template-columns from sizes array or default to equal widths
  const gridCols = node.sizes
    ? node.sizes.map(s => /^\d+$/.test(s) ? `${s}fr` : s).join(' ')
    : Array(count).fill('1fr').join(' ');

  return React.createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: gridCols,
      gap,
      alignItems: 'start',
      ...node.style,
    } as React.CSSProperties,
    className: node.className,
  }, ...kids);
}

// ─── Card ───
function CardComponent({ node }: AdaptiveComponentProps<CardNode>) {
  const { handleAction } = useAdaptive();
  const [pressed, setPressed] = React.useState(false);

  return React.createElement('div', {
    className: `adaptive-card ${node.className ?? ''}`,
    role: node.onClick ? 'button' : undefined,
    tabIndex: node.onClick ? 0 : undefined,
    style: {
      padding: '16px',
      cursor: node.onClick ? 'pointer' : 'default',
      borderColor: pressed ? 'var(--adaptive-primary)' : undefined,
      backgroundColor: pressed ? 'rgba(0, 120, 212, 0.04)' : undefined,
      ...node.style,
    } as React.CSSProperties,
    onClick: node.onClick ? () => {
      setPressed(true);
      handleAction(node.onClick!);
    } : undefined,
    onKeyDown: node.onClick ? (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setPressed(true);
        handleAction(node.onClick!);
      }
    } : undefined,
  },
    node.title && React.createElement('h3', {
      style: { margin: '0 0 4px', fontSize: '14px', fontWeight: 600 },
    }, node.title),
    node.subtitle && React.createElement('p', {
      style: { margin: '0 0 12px', fontSize: '12px', color: 'var(--adaptive-text-secondary)' },
    }, node.subtitle),
    ...renderChildren(node.children)
  );
}

// ─── List ───
function ListComponent({ node }: AdaptiveComponentProps<ListNode>) {
  const { state } = useAdaptive();
  const items: Array<Record<string, AdaptiveValue>> = typeof node.items === 'string'
    ? (state[node.items] as Array<Record<string, AdaptiveValue>>) ?? []
    : node.items;

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '8px', ...node.style } as React.CSSProperties,
    className: node.className,
  }, ...items.map((item, i) =>
    React.createElement(AdaptiveRenderer, {
      key: `list-item-${i}`,
      node: node.itemTemplate,
      itemContext: item,
      itemIndex: i,
    })
  ));
}

// ─── Table ───
function TableComponent({ node }: AdaptiveComponentProps<TableNode>) {
  const { state } = useAdaptive();
  const configuredColumns = Array.isArray((node as { columns?: unknown }).columns)
    ? (node.columns as Array<{ key?: string; header?: string; width?: string }>)
        .filter((c) => c && typeof c.key === 'string' && c.key.length > 0)
        .map((c) => ({
          key: c.key as string,
          header: typeof c.header === 'string' && c.header.length > 0 ? c.header : (c.key as string),
          width: typeof c.width === 'string' ? c.width : undefined,
        }))
    : [];

  let rows: Array<Record<string, AdaptiveValue>>;
  if (typeof node.rows === 'string') {
    const raw = state[node.rows];
    if (Array.isArray(raw)) {
      rows = raw as Array<Record<string, AdaptiveValue>>;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        rows = [];
      }
    } else {
      rows = [];
    }
  } else {
    rows = Array.isArray(node.rows) ? node.rows : [];
  }

  const inferredColumns = rows.length > 0
    ? Object.keys(rows[0]).map((key) => ({ key, header: key, width: undefined }))
    : [];
  const columns = configuredColumns.length > 0 ? configuredColumns : inferredColumns;

  if (columns.length === 0) {
    return React.createElement('div', {
      style: {
        padding: '10px 12px',
        borderRadius: 'var(--adaptive-radius, 8px)',
        border: '1px solid var(--adaptive-border, #e1dfdd)',
        color: 'var(--adaptive-text-secondary, #646464)',
        fontSize: '12px',
        ...node.style,
      } as React.CSSProperties,
      className: node.className,
    }, 'No table data available.');
  }

  return React.createElement('div', {
    style: { overflowX: 'auto' as const, ...node.style } as React.CSSProperties,
  },
    React.createElement('table', {
      style: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
      className: node.className,
    },
      React.createElement('thead', null,
        React.createElement('tr', null,
          ...columns.map((col) =>
            React.createElement('th', {
              key: col.key,
              style: {
                textAlign: 'left' as const, padding: '10px 12px',
                borderBottom: '2px solid #e1dfdd', fontWeight: 600,
                width: col.width,
              },
            }, col.header)
          )
        )
      ),
      React.createElement('tbody', null,
        ...rows.map((row, i) =>
          React.createElement('tr', { key: i },
            ...columns.map((col) =>
              React.createElement('td', {
                key: col.key,
                style: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6' },
              }, String(row[col.key] ?? ''))
            )
          )
        )
      )
    )
  );
}

// ─── Form ───
function FormComponent({ node }: AdaptiveComponentProps<FormNode>) {
  const { handleAction } = useAdaptive();
  return React.createElement('form', {
    style: node.style as React.CSSProperties,
    className: node.className,
    onSubmit: (e: React.FormEvent) => {
      e.preventDefault();
      handleAction(node.onSubmit);
    },
  }, ...renderChildren(node.children));
}

// ─── Tabs ───
function TabsComponent({ node }: AdaptiveComponentProps<TabsNode>) {
  const [activeTab, setActiveTab] = useState(node.tabs[0]?.id ?? '');
  const activeContent = node.tabs.find((t) => t.id === activeTab);

  return React.createElement('div', { style: node.style as React.CSSProperties, className: node.className },
    React.createElement('div', {
      style: { display: 'flex', borderBottom: '2px solid #e1dfdd', marginBottom: '16px' },
    },
      ...node.tabs.map((tab) =>
        React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          style: {
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '13px',
            borderBottom: activeTab === tab.id ? '2px solid var(--adaptive-primary, #0078d4)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--adaptive-primary, #0078d4)' : '#666',
            marginBottom: '-2px',
          },
        }, tab.label)
      )
    ),
    activeContent && React.createElement('div', null, ...renderChildren(activeContent.children))
  );
}

// ─── Progress ───
function ProgressComponent({ node }: AdaptiveComponentProps<ProgressNode>) {
  const val = typeof node.value === 'number' ? node.value : parseFloat(node.value as string) || 0;
  const max = node.max ?? 100;
  const pct = Math.min(100, (val / max) * 100);

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('div', {
      style: { fontSize: '13px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' },
    },
      React.createElement('span', null, node.label),
      React.createElement('span', null, `${Math.round(pct)}%`)
    ),
    React.createElement('div', {
      style: { height: '8px', backgroundColor: '#e1dfdd', borderRadius: '4px', overflow: 'hidden' },
    },
      React.createElement('div', {
        style: {
          height: '100%', width: `${pct}%`,
          backgroundColor: 'var(--adaptive-primary, #0078d4)',
          borderRadius: '4px', transition: 'width 0.3s ease',
        },
      })
    )
  );
}

// ─── Alert ───
function AlertComponent({ node }: AdaptiveComponentProps<AlertNode>) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    info: { bg: '#dae4ff', border: '#015cda', text: '#004578' },
    success: { bg: '#e6ffcc', border: '#428000', text: '#292827' },
    warning: { bg: '#ffdfb8', border: '#db7500', text: '#6d5700' },
    error: { bg: '#fdd8db', border: '#a4262c', text: '#a80000' },
  };
  const colors = colorMap[node.severity] ?? colorMap.info;

  return React.createElement('div', {
    style: {
      padding: '12px 16px', borderRadius: '2px', border: `1px solid ${colors.border}`,
      backgroundColor: colors.bg, color: colors.text, marginBottom: '12px',
      fontSize: '13px', lineHeight: '20px',
      ...node.style,
    } as React.CSSProperties,
    className: node.className,
  },
    node.title && React.createElement('div', {
      style: { fontWeight: 600, marginBottom: '4px' },
    }, node.title),
    React.createElement('div', null, node.content)
  );
}

// ─── ChatInput ───
// Module-level prompt history (persisted across re-renders, shared across all chatInput instances)
export const promptHistory: string[] = [];
export const MAX_PROMPT_HISTORY = 50;

function ChatInputComponent({ node }: AdaptiveComponentProps<ChatInputNode>) {
  const { sendPrompt, isLoading } = useAdaptive();
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const savedDraftRef = useRef('');

  const submit = () => {
    if (value.trim() && !isLoading) {
      // Add to history (avoid duplicates with the last entry)
      const trimmed = value.trim();
      if (promptHistory.length === 0 || promptHistory[promptHistory.length - 1] !== trimmed) {
        promptHistory.push(trimmed);
        if (promptHistory.length > MAX_PROMPT_HISTORY) promptHistory.shift();
      }
      sendPrompt(trimmed);
      setValue('');
      setHistoryIndex(-1);
      savedDraftRef.current = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { submit(); return; }

    if (e.key === 'ArrowUp') {
      if (promptHistory.length === 0) return;
      e.preventDefault();
      if (historyIndex === -1) {
        // Save current draft before navigating
        savedDraftRef.current = value;
      }
      const newIndex = historyIndex === -1
        ? promptHistory.length - 1
        : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setValue(promptHistory[newIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (historyIndex === -1) return;
      e.preventDefault();
      if (historyIndex >= promptHistory.length - 1) {
        // Back to draft
        setHistoryIndex(-1);
        setValue(savedDraftRef.current);
      } else {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setValue(promptHistory[newIndex]);
      }
      return;
    }
  };

  return React.createElement('div', {
    style: {
      display: 'flex', gap: '8px', padding: '12px',
      borderTop: '1px solid #e1dfdd', ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('input', {
      type: 'text',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setValue(e.target.value); setHistoryIndex(-1); },
      onKeyDown: handleKeyDown,
      placeholder: node.placeholder ?? 'Type a message...',
      disabled: isLoading,
      style: {
        flex: 1, padding: '10px 14px', borderRadius: '2px',
        border: '1px solid #8a8886', fontSize: '13px', outline: 'none',
      },
    }),
    React.createElement('button', {
      onClick: submit,
      disabled: isLoading || !value.trim(),
      style: {
        padding: '10px 20px', borderRadius: '2px', border: 'none',
        backgroundColor: 'var(--adaptive-primary, #0078d4)', color: '#fff',
        cursor: 'pointer', fontSize: '13px', fontWeight: 500,
        opacity: isLoading || !value.trim() ? 0.5 : 1,
      },
    }, isLoading ? '...' : 'Send')
  );
}

// ─── Markdown (simple) ───
function MarkdownComponent({ node }: AdaptiveComponentProps<MarkdownNode>) {
  // Simple markdown: headings, bold, italic, code, links, lists
  const html = simpleMarkdown(node.content);
  return React.createElement('div', {
    style: { lineHeight: '20px', fontSize: '13px', ...node.style } as React.CSSProperties,
    className: `adaptive-markdown ${node.className || ''}`,
    dangerouslySetInnerHTML: { __html: html },
  });
}

export function simpleMarkdown(md: string): string {
  let html = md
    // Sanitize HTML tags to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code style="background:#f3f2f1;padding:1px 4px;border-radius:2px;font-size:12px;border:1px solid #e1dfdd">$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered lists: handle -, *, and • bullets
    .replace(/^[\-\*\u2022] (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines to <br>
    .replace(/\n/g, '<br>');

  // Wrap loose <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

  return `<p>${html}</p>`;
}

// ─── RadioGroup ───
function RadioGroupComponent({ node }: AdaptiveComponentProps<RadioGroupNode>) {
  const { state, dispatch } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--adaptive-text, #292827)' },
    }, node.label),
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '2px' } as React.CSSProperties,
    },
      ...node.options.map((opt) =>
        React.createElement('label', {
          key: opt.value,
          tabIndex: 0,
          role: 'radio',
          'aria-checked': value === opt.value,
          onClick: () => dispatch({ type: 'SET', key: node.bind, value: opt.value }),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dispatch({ type: 'SET', key: node.bind, value: opt.value });
            }
          },
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 0',
            border: 'none', backgroundColor: 'transparent',
            cursor: 'pointer',
          } as React.CSSProperties,
        },
          React.createElement('div', {
            style: {
              width: '18px', height: '18px', borderRadius: '50%',
              border: value === opt.value ? '5px solid var(--adaptive-primary, #0078d4)' : '1.5px solid #8a8886',
              flexShrink: 0,
              boxSizing: 'border-box',
              backgroundColor: '#fff',
            } as React.CSSProperties,
          }),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('span', { style: { fontSize: '14px', color: 'var(--adaptive-text, #292827)' } }, opt.label),
            opt.description && React.createElement('div', {
              style: { fontSize: '13px', color: '#646464', marginTop: '2px' },
            }, opt.description)
          )
        )
      )
    )
  );
}

// ─── MultiSelect ───
function MultiSelectComponent({ node }: AdaptiveComponentProps<MultiSelectNode>) {
  const { state, dispatch } = useAdaptive();
  const rawValue = state[node.bind];
  // Value is stored as a comma-separated string
  const selected: string[] = typeof rawValue === 'string' && rawValue
    ? rawValue.split(',')
    : [];

  const toggle = (val: string) => {
    const newSelected = selected.includes(val)
      ? selected.filter((s) => s !== val)
      : [...selected, val];
    dispatch({ type: 'SET', key: node.bind, value: newSelected.join(',') });
  };

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #292827)' },
    }, node.label),
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '0' } as React.CSSProperties,
    },
      ...node.options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return React.createElement('label', {
          key: opt.value,
          tabIndex: 0,
          role: 'checkbox',
          'aria-checked': isSelected,
          onClick: () => toggle(opt.value),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle(opt.value);
            }
          },
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 0',
            border: 'none', backgroundColor: 'transparent',
            cursor: 'pointer',
          } as React.CSSProperties,
        },
          React.createElement('div', {
            style: {
              width: '16px', height: '16px', borderRadius: '2px',
              border: isSelected ? 'none' : '1px solid #8a8886',
              backgroundColor: isSelected ? 'var(--adaptive-primary, #0078d4)' : '#fff',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '11px', fontWeight: 700,
              boxSizing: 'border-box',
            } as React.CSSProperties,
          }, isSelected ? '✓' : ''),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('span', { style: { fontSize: '13px', color: 'var(--adaptive-text, #292827)' } }, opt.label),
            opt.description && React.createElement('div', {
              style: { fontSize: '12px', color: '#646464', marginTop: '1px' },
            }, opt.description)
          )
        );
      })
    )
  );
}

// ─── Toggle ───
function ToggleComponent({ node }: AdaptiveComponentProps<ToggleNode>) {
  const { state, dispatch } = useAdaptive();
  const isOn = state[node.bind] === 'true' || state[node.bind] === true;

  return React.createElement('label', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer', ...node.style } as React.CSSProperties,
    onClick: () => dispatch({ type: 'SET', key: node.bind, value: isOn ? 'false' : 'true' }),
  },
    React.createElement('div', {
      style: {
        width: '44px', height: '24px', borderRadius: '12px',
        backgroundColor: isOn ? 'var(--adaptive-primary, #0078d4)' : '#8a8886',
        position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: {
          width: '20px', height: '20px', borderRadius: '50%',
          backgroundColor: '#fff', position: 'absolute', top: '2px',
          left: isOn ? '22px' : '2px', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        } as React.CSSProperties,
      })
    ),
    React.createElement('div', null,
      node.label && React.createElement('div', { style: { fontSize: '13px', fontWeight: 500 } }, node.label),
      node.description && React.createElement('div', { style: { fontSize: '12px', color: '#646464' } }, node.description)
    )
  );
}

// ─── Slider ───
function SliderComponent({ node }: AdaptiveComponentProps<SliderNode>) {
  const { state, dispatch } = useAdaptive();
  const value = Number(state[node.bind] ?? node.min ?? 0);
  const min = node.min ?? 0;
  const max = node.max ?? 100;

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 500, marginBottom: '6px' },
    },
      React.createElement('span', null, node.label),
      React.createElement('span', { style: { color: 'var(--adaptive-primary, #0078d4)', fontWeight: 600 } }, value)
    ),
    React.createElement('input', {
      type: 'range',
      min, max,
      step: node.step ?? 1,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET', key: node.bind, value: e.target.value }),
      style: { width: '100%', accentColor: 'var(--adaptive-primary, #0078d4)' },
    })
  );
}

// ─── Divider ───
function DividerComponent({ node }: AdaptiveComponentProps<DividerNode>) {
  if (node.label) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0', ...node.style } as React.CSSProperties,
    },
      React.createElement('div', { style: { flex: 1, height: '1px', backgroundColor: '#e1dfdd' } }),
      React.createElement('span', { style: { fontSize: '12px', color: '#a19f9d', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } }, node.label),
      React.createElement('div', { style: { flex: 1, height: '1px', backgroundColor: '#e1dfdd' } })
    );
  }
  return React.createElement('hr', {
    style: { border: 'none', height: '1px', backgroundColor: '#e1dfdd', margin: '16px 0', ...node.style },
  });
}

// ─── Badge ───
function BadgeComponent({ node }: AdaptiveComponentProps<BadgeNode>) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: { bg: '#dbeafe', text: '#1e40af' },
    green: { bg: '#dcfce7', text: '#166534' },
    red: { bg: '#fee2e2', text: '#991b1b' },
    yellow: { bg: '#fef9c3', text: '#854d0e' },
    gray: { bg: '#f3f4f6', text: '#374151' },
    purple: { bg: '#f3e8ff', text: '#6b21a8' },
  };
  const c = colors[node.color ?? 'blue'];

  return React.createElement('span', {
    style: {
      display: 'inline-block', padding: '2px 10px', borderRadius: '9999px',
      fontSize: '12px', fontWeight: 500,
      backgroundColor: c.bg, color: c.text, ...node.style,
    } as React.CSSProperties,
  }, node.content);
}

// ─── Accordion ───
function AccordionComponent({ node }: AdaptiveComponentProps<AccordionNode>) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    ...node.items.map((item, idx) => {
      const itemId = item.id || `acc-${idx}`;
      const isOpen = openId === itemId;
      const label = item.label || `Section ${idx + 1}`;
      return React.createElement('div', { key: itemId, style: { borderBottom: '1px solid #e1dfdd' } },
        React.createElement('button', {
          onClick: () => setOpenId(isOpen ? null : itemId),
          style: {
            width: '100%', padding: '10px 0', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 500, color: 'var(--adaptive-text, #292827)',
          },
        },
          label,
          React.createElement('span', {
            style: { transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '10px', color: '#a19f9d' },
          }, '▼')
        ),
        isOpen && React.createElement('div', { style: { paddingBottom: '10px', fontSize: '13px', lineHeight: 1.6 } },
          ...item.children.map((child, i) =>
            React.createElement(AdaptiveRenderer, { key: i, node: child })
          )
        )
      );
    })
  );
}

// ─── Code Block ───
function CodeBlockComponent({ node }: AdaptiveComponentProps<CodeBlockNode>) {
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(node.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    // Generate filename from label (same logic as SolutionArchitectApp codeBlockToFilename)
    const ext = ({ bicep: 'bicep', json: 'json', yaml: 'yaml', yml: 'yaml', typescript: 'ts', javascript: 'js', python: 'py', bash: 'sh', shell: 'sh', dockerfile: 'Dockerfile', hcl: 'tf', terraform: 'tf' } as Record<string, string>)[node.language || ''] || node.language || 'txt';
    const filename = node.label && node.label.includes('.') ? node.label : node.label ? node.label.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/-+$/, '') + '.' + ext : `artifact.${ext}`;
    upsertArtifact(filename, node.code, node.language || '', node.label);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return React.createElement('div', {
    style: {
      position: 'relative', marginBottom: '12px',
      maxWidth: '100%', boxSizing: 'border-box',
      ...node.style,
    } as React.CSSProperties,
  },
    (node.language || node.label) && React.createElement('div', {
      style: {
        backgroundColor: '#2d2d2d', color: '#ccc', padding: '6px 12px',
        fontSize: '11px', borderRadius: 'var(--adaptive-radius, 2px) var(--adaptive-radius, 2px) 0 0', fontFamily: "'Cascadia Code', 'Consolas', monospace",
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      React.createElement('span', {
        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginRight: '8px' },
      }, node.label || node.language),
      React.createElement('div', { style: { display: 'flex', gap: '8px', flexShrink: 0 } },
        React.createElement('button', {
          onClick: handleSave,
          style: { background: 'none', border: 'none', color: saved ? '#6a9955' : '#ccc', cursor: 'pointer', fontSize: '11px' },
        }, saved ? '\u2713 Saved' : 'Save'),
        React.createElement('button', {
          onClick: handleCopy,
          style: { background: 'none', border: 'none', color: copied ? '#6a9955' : '#ccc', cursor: 'pointer', fontSize: '11px' },
        }, copied ? '\u2713 Copied' : 'Copy')
      )
    ),
    React.createElement('pre', {
      style: {
        backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '14px',
        borderRadius: (node.language || node.label) ? '0 0 var(--adaptive-radius, 2px) var(--adaptive-radius, 2px)' : 'var(--adaptive-radius, 2px)',
        fontSize: '13px', fontFamily: "'Cascadia Code', 'Consolas', monospace", overflowX: 'auto' as const,
        margin: 0, lineHeight: 1.6,
        maxWidth: '100%', boxSizing: 'border-box',
        border: '1px solid var(--adaptive-border, #e1dfdd)',
      },
    },
      React.createElement('code', null, node.code)
    )
  );
}

// ─── Link ───
function LinkComponent({ node }: AdaptiveComponentProps<LinkNode>) {
  return React.createElement('a', {
    href: sanitizeUrl(node.href),
    target: node.external ? '_blank' : undefined,
    rel: node.external ? 'noopener noreferrer' : undefined,
    style: {
      color: 'var(--adaptive-primary, #0078d4)', textDecoration: 'none',
      fontSize: '13px', fontWeight: 400, ...node.style,
    } as React.CSSProperties,
  }, node.label, node.external && ' ↗');
}

// ─── Register all built-in components ───
export function registerBuiltinComponents(): void {
  registerComponents({
    text: TextComponent,
    button: ButtonComponent,
    input: InputComponent,
    select: SelectComponent,
    combobox: ComboboxComponent,
    questionnaire: QuestionnaireComponent,
    image: ImageComponent,
    container: ContainerComponent,    columns: ColumnsComponent,    card: CardComponent,
    list: ListComponent,
    table: TableComponent,
    form: FormComponent,
    tabs: TabsComponent,
    progress: ProgressComponent,
    alert: AlertComponent,
    chatInput: ChatInputComponent,
    markdown: MarkdownComponent,
    radioGroup: RadioGroupComponent,
    multiSelect: MultiSelectComponent,
    toggle: ToggleComponent,
    slider: SliderComponent,
    divider: DividerComponent,
    badge: BadgeComponent,
    accordion: AccordionComponent,
    codeBlock: CodeBlockComponent,
    link: LinkComponent,
  });
}
