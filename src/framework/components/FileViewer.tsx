// ─── File Viewer ───
// Center panel that shows the content of a selected artifact.
// Renders Mermaid diagrams for .mmd files, code for everything else.

import React from 'react';
import type { Artifact } from '../artifacts';
import { downloadArtifact } from '../artifacts';
import { ArchitectureDiagram } from './ArchitectureDiagram';

interface FileViewerProps {
  artifact: Artifact;
}

export function FileViewer({ artifact }: FileViewerProps) {
  const isMermaid = artifact.filename.endsWith('.mmd');

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
        style: { display: 'flex', alignItems: 'center', gap: '8px' },
      },
        React.createElement('span', {
          style: {
            fontSize: '12px', fontWeight: 600,
            backgroundColor: 'var(--adaptive-primary, #2563eb)',
            color: '#fff',
            padding: '2px 8px', borderRadius: '4px',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.03em',
          },
        }, isMermaid ? 'Diagram' : artifact.language || 'File'),
        React.createElement('span', {
          style: {
            fontSize: '14px', fontWeight: 500,
            color: 'var(--adaptive-text, #111827)',
            fontFamily: 'monospace',
          },
        }, artifact.filename)
      ),
      React.createElement('div', {
        style: { display: 'flex', gap: '6px' },
      },
        React.createElement('button', {
          onClick: () => { navigator.clipboard.writeText(artifact.content); },
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
      : React.createElement('pre', {
          style: {
            flex: 1, margin: 0, padding: '16px',
            fontSize: '14px',
            fontFamily: 'Consolas, "Courier New", monospace',
            overflow: 'auto', lineHeight: 1.6,
            color: 'var(--adaptive-text, #111827)',
            backgroundColor: 'var(--adaptive-bg, #f5f5f5)',
            whiteSpace: 'pre-wrap' as const,
            wordBreak: 'break-word' as const,
          },
        }, artifact.content)
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
