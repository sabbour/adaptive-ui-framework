import React, { useState, useRef, useEffect } from 'react';
import type { AdaptiveComponentProps } from '../registry';
import { registerComponents } from '../registry';
import { renderChildren, AdaptiveRenderer } from '../renderer';
import { useAdaptive } from '../context';

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
        width: '100%', padding: '8px 12px', borderRadius: '6px',
        border: '1px solid #d1d5db', fontSize: '14px',
        backgroundColor: '#fff', cursor: 'pointer',
        textAlign: 'left' as const, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      },
    },
      React.createElement('span', {
        style: selectedLabel ? {} : { color: '#9ca3af' },
      }, selectedLabel || placeholder || '— Select —'),
      React.createElement('span', { style: { fontSize: '10px', marginLeft: '8px' } }, open ? '▲' : '▼')
    ),
    // Dropdown panel
    open && React.createElement('div', {
      style: {
        position: 'absolute', top: '100%', left: 0, right: 0,
        marginTop: '4px', backgroundColor: '#fff',
        border: '1px solid #d1d5db', borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 1000, maxHeight: '240px', display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties,
    },
      // Search input
      React.createElement('input', {
        type: 'text',
        value: search,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
        placeholder: 'Search...',
        autoFocus: true,
        style: {
          padding: '8px 12px', border: 'none',
          borderBottom: '1px solid #e5e7eb', fontSize: '14px',
          outline: 'none', borderRadius: '6px 6px 0 0',
        },
      }),
      // Options list
      React.createElement('div', {
        style: { overflowY: 'auto', maxHeight: '200px' } as React.CSSProperties,
      },
        filtered.length === 0
          ? React.createElement('div', {
              style: { padding: '8px 12px', color: '#9ca3af', fontSize: '13px' },
            }, 'No matches')
          : filtered.map((opt) =>
              React.createElement('div', {
                key: opt.value,
                onClick: () => { onChange(opt.value); setOpen(false); setSearch(''); },
                style: {
                  padding: '8px 12px', cursor: 'pointer', fontSize: '14px',
                  backgroundColor: opt.value === value ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  fontWeight: opt.value === value ? 500 : 400,
                },
                onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(37, 99, 235, 0.06)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = opt.value === value ? 'rgba(37, 99, 235, 0.08)' : 'transparent';
                },
              }, opt.label)
            )
      )
    )
  );
}
import { sanitizeUrl } from '../sanitize';
import type {
  TextNode, ButtonNode, InputNode, SelectNode, ImageNode,
  ContainerNode, CardNode, ListNode, TableNode, FormNode,
  TabsNode, ProgressNode, AlertNode, ChatInputNode, MarkdownNode,
  RadioGroupNode, MultiSelectNode, ToggleNode, SliderNode,
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
    h1: { fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5em' },
    h2: { fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.4em' },
    h3: { fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.3em' },
    h4: { fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.2em' },
    body: { fontSize: '1rem', margin: '0 0 0.5em' },
    caption: { fontSize: '0.85rem', color: '#666' },
    code: { fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '2px 6px', borderRadius: '3px' },
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
    primary: { backgroundColor: 'var(--adaptive-primary, #2563eb)', color: '#fff', border: 'none' },
    secondary: { backgroundColor: 'transparent', color: 'var(--adaptive-primary, #2563eb)', border: '1px solid var(--adaptive-primary, #2563eb)' },
    danger: { backgroundColor: '#dc2626', color: '#fff', border: 'none' },
    ghost: { backgroundColor: 'transparent', color: 'inherit', border: 'none' },
  };
  return React.createElement('button', {
    style: {
      padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
      fontWeight: 500, transition: 'opacity 0.2s',
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
  const { state, dispatch } = useAdaptive();
  const value = (state[node.bind] as string) ?? '';
  const isTextarea = node.inputType === 'textarea';
  const Tag = isTextarea ? 'textarea' : 'input';

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 },
    }, node.label),
    React.createElement(Tag, {
      type: isTextarea ? undefined : (node.inputType ?? 'text'),
      placeholder: node.placeholder,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        dispatch({ type: 'SET', key: node.bind, value: e.target.value });
      },
      style: {
        width: '100%', padding: '8px 12px', borderRadius: '6px',
        border: '1px solid #d1d5db', fontSize: '14px',
        boxSizing: 'border-box' as const,
        ...(isTextarea ? { minHeight: '80px', resize: 'vertical' as const } : {}),
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
      style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 },
    }, node.label),
    React.createElement(SearchableDropdown, {
      options,
      value,
      onChange: (v: string) => dispatch({ type: 'SET', key: node.bind, value: v }),
      className: node.className,
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
    style: node.style as React.CSSProperties,
    className: node.className,
  }, ...renderChildren(node.children));
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
      backgroundColor: pressed ? 'rgba(37, 99, 235, 0.04)' : undefined,
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
      style: { margin: '0 0 4px', fontSize: '1.05rem' },
    }, node.title),
    node.subtitle && React.createElement('p', {
      style: { margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--adaptive-text-secondary)' },
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
        border: '1px solid var(--adaptive-border, #e5e7eb)',
        color: 'var(--adaptive-text-secondary, #6b7280)',
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
      style: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '14px' },
      className: node.className,
    },
      React.createElement('thead', null,
        React.createElement('tr', null,
          ...columns.map((col) =>
            React.createElement('th', {
              key: col.key,
              style: {
                textAlign: 'left' as const, padding: '10px 12px',
                borderBottom: '2px solid #e5e7eb', fontWeight: 600,
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
      style: { display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '16px' },
    },
      ...node.tabs.map((tab) =>
        React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          style: {
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '14px',
            borderBottom: activeTab === tab.id ? '2px solid var(--adaptive-primary, #2563eb)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--adaptive-primary, #2563eb)' : '#666',
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
      style: { fontSize: '14px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' },
    },
      React.createElement('span', null, node.label),
      React.createElement('span', null, `${Math.round(pct)}%`)
    ),
    React.createElement('div', {
      style: { height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' },
    },
      React.createElement('div', {
        style: {
          height: '100%', width: `${pct}%`,
          backgroundColor: 'var(--adaptive-primary, #2563eb)',
          borderRadius: '4px', transition: 'width 0.3s ease',
        },
      })
    )
  );
}

// ─── Alert ───
function AlertComponent({ node }: AdaptiveComponentProps<AlertNode>) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
    success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  };
  const colors = colorMap[node.severity] ?? colorMap.info;

  return React.createElement('div', {
    style: {
      padding: '12px 16px', borderRadius: '6px', borderLeft: `4px solid ${colors.border}`,
      backgroundColor: colors.bg, color: colors.text, marginBottom: '12px',
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
function ChatInputComponent({ node }: AdaptiveComponentProps<ChatInputNode>) {
  const { sendPrompt, isLoading } = useAdaptive();
  const [value, setValue] = useState('');

  const submit = () => {
    if (value.trim() && !isLoading) {
      sendPrompt(value.trim());
      setValue('');
    }
  };

  return React.createElement('div', {
    style: {
      display: 'flex', gap: '8px', padding: '12px',
      borderTop: '1px solid #e5e7eb', ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('input', {
      type: 'text',
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); },
      placeholder: node.placeholder ?? 'Type a message...',
      disabled: isLoading,
      style: {
        flex: 1, padding: '10px 14px', borderRadius: '8px',
        border: '1px solid #d1d5db', fontSize: '14px', outline: 'none',
      },
    }),
    React.createElement('button', {
      onClick: submit,
      disabled: isLoading || !value.trim(),
      style: {
        padding: '10px 20px', borderRadius: '8px', border: 'none',
        backgroundColor: 'var(--adaptive-primary, #2563eb)', color: '#fff',
        cursor: 'pointer', fontSize: '14px', fontWeight: 500,
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
    style: { lineHeight: 1.6, fontSize: '14px', ...node.style } as React.CSSProperties,
    className: `adaptive-markdown ${node.className || ''}`,
    dangerouslySetInnerHTML: { __html: html },
  });
}

function simpleMarkdown(md: string): string {
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
    .replace(/`(.+?)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:3px">$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
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
      style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 },
    }, node.label),
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '8px' } as React.CSSProperties,
    },
      ...node.options.map((opt) =>
        React.createElement('label', {
          key: opt.value,
          onClick: () => dispatch({ type: 'SET', key: node.bind, value: opt.value }),
          style: {
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '10px 14px', borderRadius: '8px',
            border: value === opt.value ? '2px solid var(--adaptive-primary, #2563eb)' : '1px solid #d1d5db',
            backgroundColor: value === opt.value ? 'rgba(37, 99, 235, 0.04)' : '#fff',
            cursor: 'pointer', transition: 'all 0.15s ease',
          } as React.CSSProperties,
        },
          React.createElement('div', {
            style: {
              width: '18px', height: '18px', borderRadius: '50%',
              border: value === opt.value ? '5px solid var(--adaptive-primary, #2563eb)' : '2px solid #d1d5db',
              flexShrink: 0, marginTop: '2px',
              boxSizing: 'border-box',
            } as React.CSSProperties,
          }),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '14px', fontWeight: 500 } }, opt.label),
            opt.description && React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
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
      style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 },
    }, node.label),
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '8px' } as React.CSSProperties,
    },
      ...node.options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return React.createElement('label', {
          key: opt.value,
          onClick: () => toggle(opt.value),
          style: {
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '10px 14px', borderRadius: '8px',
            border: isSelected ? '2px solid var(--adaptive-primary, #2563eb)' : '1px solid #d1d5db',
            backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.04)' : '#fff',
            cursor: 'pointer', transition: 'all 0.15s ease',
          } as React.CSSProperties,
        },
          React.createElement('div', {
            style: {
              width: '18px', height: '18px', borderRadius: '4px',
              border: isSelected ? 'none' : '2px solid #d1d5db',
              backgroundColor: isSelected ? 'var(--adaptive-primary, #2563eb)' : '#fff',
              flexShrink: 0, marginTop: '2px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '12px', fontWeight: 700,
              boxSizing: 'border-box',
            } as React.CSSProperties,
          }, isSelected ? '✓' : ''),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '14px', fontWeight: 500 } }, opt.label),
            opt.description && React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
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
        backgroundColor: isOn ? 'var(--adaptive-primary, #2563eb)' : '#d1d5db',
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
      node.label && React.createElement('div', { style: { fontSize: '14px', fontWeight: 500 } }, node.label),
      node.description && React.createElement('div', { style: { fontSize: '12px', color: '#6b7280' } }, node.description)
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
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 500, marginBottom: '6px' },
    },
      React.createElement('span', null, node.label),
      React.createElement('span', { style: { color: 'var(--adaptive-primary, #2563eb)', fontWeight: 600 } }, value)
    ),
    React.createElement('input', {
      type: 'range',
      min, max,
      step: node.step ?? 1,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET', key: node.bind, value: e.target.value }),
      style: { width: '100%', accentColor: 'var(--adaptive-primary, #2563eb)' },
    })
  );
}

// ─── Divider ───
function DividerComponent({ node }: AdaptiveComponentProps<DividerNode>) {
  if (node.label) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0', ...node.style } as React.CSSProperties,
    },
      React.createElement('div', { style: { flex: 1, height: '1px', backgroundColor: '#e5e7eb' } }),
      React.createElement('span', { style: { fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } }, node.label),
      React.createElement('div', { style: { flex: 1, height: '1px', backgroundColor: '#e5e7eb' } })
    );
  }
  return React.createElement('hr', {
    style: { border: 'none', height: '1px', backgroundColor: '#e5e7eb', margin: '16px 0', ...node.style },
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
      return React.createElement('div', { key: itemId, style: { borderBottom: '1px solid #e5e7eb' } },
        React.createElement('button', {
          onClick: () => setOpenId(isOpen ? null : itemId),
          style: {
            width: '100%', padding: '10px 0', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '14px', fontWeight: 500, color: 'var(--adaptive-text, #111827)',
          },
        },
          label,
          React.createElement('span', {
            style: { transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '10px', color: '#9ca3af' },
          }, '▼')
        ),
        isOpen && React.createElement('div', { style: { paddingBottom: '10px', fontSize: '14px', lineHeight: 1.6 } },
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

  const handleCopy = () => {
    navigator.clipboard.writeText(node.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return React.createElement('div', {
    style: { position: 'relative', marginBottom: '12px', ...node.style } as React.CSSProperties,
  },
    node.language && React.createElement('div', {
      style: {
        backgroundColor: '#1f2937', color: '#9ca3af', padding: '6px 12px',
        fontSize: '11px', borderRadius: '8px 8px 0 0', fontFamily: 'monospace',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      node.language,
      React.createElement('button', {
        onClick: handleCopy,
        style: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '11px' },
      }, copied ? '✓ Copied' : 'Copy')
    ),
    React.createElement('pre', {
      style: {
        backgroundColor: '#111827', color: '#e5e7eb', padding: '14px',
        borderRadius: node.language ? '0 0 8px 8px' : '8px',
        fontSize: '13px', fontFamily: 'monospace', overflowX: 'auto' as const,
        margin: 0, lineHeight: 1.6,
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
      color: 'var(--adaptive-primary, #2563eb)', textDecoration: 'none',
      fontSize: '14px', fontWeight: 500, ...node.style,
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
    image: ImageComponent,
    container: ContainerComponent,
    card: CardComponent,
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
