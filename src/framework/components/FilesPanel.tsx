// ─── Files Panel ───
// Shows saved artifacts (code blocks) in a sidebar panel.
// Supports viewing, downloading, and removing artifacts.

import React, { useSyncExternalStore, useState } from 'react';
import { getArtifacts, subscribeArtifacts, downloadArtifact, removeArtifact, clearArtifacts, type Artifact } from '../artifacts';

export function FilesPanel() {
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? artifacts.find((a) => a.id === selectedId) : null;

  if (selected) {
    return React.createElement('div', {
      style: {
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: 'var(--adaptive-surface, #fff)', color: 'var(--adaptive-text, #111827)',
        borderLeft: '1px solid var(--adaptive-border, #e5e7eb)',
      } as React.CSSProperties,
    },
      // Header
      React.createElement('div', {
        style: {
          padding: '8px 12px', borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '12px', flexShrink: 0,
        },
      },
        React.createElement('button', {
          onClick: () => setSelectedId(null),
          style: {
            background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
            cursor: 'pointer', fontSize: '12px', padding: '2px 0',
          },
        }, '\u2190 Back'),
        React.createElement('div', { style: { display: 'flex', gap: '6px' } },
          React.createElement('button', {
            onClick: () => downloadArtifact(selected),
            style: {
              background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
              color: 'var(--adaptive-text, #111827)', cursor: 'pointer', fontSize: '10px', padding: '2px 8px',
            },
          }, 'Download'),
          React.createElement('button', {
            onClick: () => { navigator.clipboard.writeText(selected.content); },
            style: {
              background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
              color: 'var(--adaptive-text, #111827)', cursor: 'pointer', fontSize: '10px', padding: '2px 8px',
            },
          }, 'Copy')
        )
      ),
      // Filename
      React.createElement('div', {
        style: {
          padding: '6px 12px', fontSize: '11px', fontWeight: 600,
          color: 'var(--adaptive-text, #111827)', borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
          fontFamily: 'monospace',
        },
      }, selected.filename),
      // Content
      React.createElement('pre', {
        style: {
          flex: 1, margin: 0, padding: '12px',
          fontSize: '12px', fontFamily: 'Consolas, "Courier New", monospace',
          overflow: 'auto', lineHeight: 1.6, color: 'var(--adaptive-text, #111827)',
        },
      }, selected.content)
    );
  }

  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: 'var(--adaptive-surface, #fff)', color: 'var(--adaptive-text, #111827)',
      borderLeft: '1px solid var(--adaptive-border, #e5e7eb)',
    } as React.CSSProperties,
  },
    // Header
    React.createElement('div', {
      style: {
        padding: '8px 12px', borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '12px', fontWeight: 600, color: 'var(--adaptive-text, #111827)', flexShrink: 0,
      },
    },
      `Files (${artifacts.length})`,
      artifacts.length > 0 && React.createElement('button', {
        onClick: clearArtifacts,
        style: {
          background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
          cursor: 'pointer', fontSize: '10px',
        },
      }, 'Clear all')
    ),

    // File list
    artifacts.length === 0
      ? React.createElement('div', {
          style: { padding: '20px 12px', fontSize: '12px', color: 'var(--adaptive-text-secondary, #6b7280)', textAlign: 'center' as const },
        },
          'No files yet.',
          React.createElement('br'),
          React.createElement('span', { style: { fontSize: '11px' } },
            'Click "Save" on any code block to add it here.'
          )
        )
      : React.createElement('div', {
          style: { flex: 1, overflow: 'auto' } as React.CSSProperties,
        },
          ...artifacts.map((artifact) =>
            React.createElement('div', {
              key: artifact.id,
              onClick: () => setSelectedId(artifact.id),
              style: {
                padding: '8px 12px', cursor: 'pointer',
                borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              },
              onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--adaptive-bg, #f5f5f5)';
              },
              onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              },
            },
              React.createElement('div', null,
                React.createElement('div', {
                  style: { fontSize: '12px', fontFamily: 'monospace', color: 'var(--adaptive-text, #111827)' },
                }, artifact.filename),
                artifact.label && React.createElement('div', {
                  style: { fontSize: '10px', color: 'var(--adaptive-text-secondary, #6b7280)', marginTop: '2px' },
                }, artifact.label)
              ),
              React.createElement('div', { style: { display: 'flex', gap: '4px', flexShrink: 0 } },
                React.createElement('button', {
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); downloadArtifact(artifact); },
                  title: 'Download',
                  style: {
                    background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
                    cursor: 'pointer', fontSize: '12px', padding: '2px',
                  },
                }, '\u2913'),
                React.createElement('button', {
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); removeArtifact(artifact.id); },
                  title: 'Remove',
                  style: {
                    background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
                    cursor: 'pointer', fontSize: '12px', padding: '2px',
                  },
                }, '\u2715')
              )
            )
          )
        )
  );
}
