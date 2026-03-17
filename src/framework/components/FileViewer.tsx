// ─── File Viewer ───
// Center panel that shows the content of a selected artifact.
// Renders Mermaid diagrams for .mmd files, syntax-highlighted + editable code for everything else.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Artifact } from '../artifacts';
import { downloadArtifact, upsertArtifact } from '../artifacts';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-bicep';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-hcl';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';

/** Map our language keys to Prism grammar names */
const LANG_MAP: Record<string, string> = {
  bicep: 'bicep', json: 'json', yaml: 'yaml', yml: 'yaml',
  bash: 'bash', sh: 'bash', shell: 'bash',
  dockerfile: 'docker', docker: 'docker',
  hcl: 'hcl', terraform: 'hcl', tf: 'hcl',
  typescript: 'typescript', ts: 'typescript',
  javascript: 'javascript', js: 'javascript',
  python: 'python', py: 'python',
  css: 'css', sql: 'sql', markdown: 'markdown', md: 'markdown',
};

function getPrismLang(language: string): string {
  return LANG_MAP[language] || language || 'plaintext';
}

function highlight(code: string, language: string): string {
  const lang = getPrismLang(language);
  const grammar = Prism.languages[lang];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, lang);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface FileViewerProps {
  artifact: Artifact;
  onArtifactUpdate?: (artifact: Artifact) => void;
}

export function FileViewer({ artifact, onArtifactUpdate }: FileViewerProps) {
  const isMermaid = artifact.filename.endsWith('.mmd');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync edit content when artifact changes
  useEffect(() => {
    setEditContent(artifact.content);
    setEditing(false);
  }, [artifact.id, artifact.content]);

  const handleSave = useCallback(() => {
    const updated = upsertArtifact(artifact.filename, editContent, artifact.language, artifact.label);
    onArtifactUpdate?.(updated);
    setEditing(false);
  }, [artifact, editContent, onArtifactUpdate]);

  const handleCancel = useCallback(() => {
    setEditContent(artifact.content);
    setEditing(false);
  }, [artifact.content]);

  const handleEdit = useCallback(() => {
    setEditContent(artifact.content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [artifact.content]);

  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: 'var(--adaptive-surface, #fff)',
    } as React.CSSProperties,
  },
    // Header bar with filename + actions
    React.createElement('div', {
      style: {
        padding: '10px 16px',
        borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
        backgroundColor: 'var(--adaptive-surface, #fff)',
      },
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' },
      },
        React.createElement('span', {
          style: {
            fontSize: '12px', fontWeight: 600,
            backgroundColor: 'var(--adaptive-primary, #2563eb)',
            color: '#fff',
            padding: '2px 8px', borderRadius: '4px',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.03em', flexShrink: 0,
          },
        }, isMermaid ? 'Diagram' : artifact.language || 'File'),
        React.createElement('span', {
          style: {
            fontSize: '14px', fontWeight: 500,
            color: 'var(--adaptive-text, #111827)',
            fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
          },
        }, artifact.filename)
      ),
      React.createElement('div', {
        style: { display: 'flex', gap: '6px', flexShrink: 0 },
      },
        // Edit / Save / Cancel buttons
        !isMermaid && (editing
          ? [
              React.createElement('button', {
                key: 'save',
                onClick: handleSave,
                style: {
                  background: '#16a34a', border: 'none',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  padding: '5px 12px', color: '#fff', fontWeight: 500,
                },
              }, 'Save'),
              React.createElement('button', {
                key: 'cancel',
                onClick: handleCancel,
                style: {
                  background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  padding: '5px 12px', color: 'var(--adaptive-text, #111827)',
                },
              }, 'Cancel'),
            ]
          : React.createElement('button', {
              onClick: handleEdit,
              style: {
                background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
                borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                padding: '5px 12px', color: 'var(--adaptive-text, #111827)',
              },
            }, 'Edit')
        ),
        React.createElement('button', {
          onClick: () => { navigator.clipboard.writeText(editing ? editContent : artifact.content); },
          style: {
            background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
            borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            padding: '5px 12px', color: 'var(--adaptive-text, #111827)',
          },
        }, 'Copy'),
        React.createElement('button', {
          onClick: () => downloadArtifact(artifact),
          style: {
            background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
            borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            padding: '5px 12px', color: 'var(--adaptive-text, #111827)',
          },
        }, 'Download')
      )
    ),

    // Content area
    isMermaid
      ? React.createElement('div', {
          style: { flex: 1, minHeight: 0, overflow: 'hidden' } as React.CSSProperties,
        },
          React.createElement(ArchitectureDiagram, {
            diagram: artifact.content,
            title: artifact.label || 'Architecture',
          })
        )
      : editing
        // Edit mode — plain textarea
        ? React.createElement('textarea', {
            ref: textareaRef,
            value: editContent,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value),
            onKeyDown: (e: React.KeyboardEvent) => {
              // Ctrl+S to save
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
              }
              // Escape to cancel
              if (e.key === 'Escape') handleCancel();
              // Tab inserts 2 spaces
              if (e.key === 'Tab') {
                e.preventDefault();
                const ta = e.target as HTMLTextAreaElement;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const val = ta.value;
                setEditContent(val.slice(0, start) + '  ' + val.slice(end));
                setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
              }
            },
            style: {
              flex: 1, margin: 0, padding: '16px',
              fontSize: '14px',
              fontFamily: 'Consolas, "Courier New", monospace',
              lineHeight: 1.6, resize: 'none' as const,
              border: 'none', outline: 'none',
              backgroundColor: '#1e1e2e', color: '#cdd6f4',
              whiteSpace: 'pre' as const,
              overflow: 'auto',
            },
          })
        // View mode — syntax highlighted
        : React.createElement('pre', {
            className: 'language-' + getPrismLang(artifact.language),
            style: {
              flex: 1, margin: 0, padding: '16px',
              fontSize: '14px',
              fontFamily: 'Consolas, "Courier New", monospace',
              overflow: 'auto', lineHeight: 1.6,
              backgroundColor: '#1d1f21',
              whiteSpace: 'pre' as const,
              wordBreak: 'break-word' as const,
            },
          },
            React.createElement('code', {
              className: 'language-' + getPrismLang(artifact.language),
              dangerouslySetInnerHTML: { __html: highlight(artifact.content, artifact.language) },
            })
          )
  );
}

export function FileViewerPlaceholder() {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%',
      backgroundColor: 'var(--adaptive-bg, #f5f5f5)',
      color: 'var(--adaptive-text-secondary, #6b7280)',
      fontSize: '14px',
    } as React.CSSProperties,
  },
    React.createElement('div', { style: { textAlign: 'center' as const } },
      React.createElement('div', {
        style: { fontSize: '40px', marginBottom: '12px', opacity: 0.5 },
      }, '\uD83D\uDCC4'),
      React.createElement('div', {
        style: { fontWeight: 500, marginBottom: '6px', fontSize: '15px' },
      }, 'No file selected'),
      React.createElement('div', {
        style: { fontSize: '13px', color: 'var(--adaptive-text-secondary, #6b7280)' },
      }, 'Select a file from the sidebar to view its contents')
    )
  );
}
