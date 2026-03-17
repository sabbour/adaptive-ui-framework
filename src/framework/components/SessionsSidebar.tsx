// ─── Sessions Sidebar ───
// Shows saved conversation sessions and file artifacts in a collapsible left sidebar.
// Sessions section on top, Files section below.

import React, { useSyncExternalStore, useState } from 'react';
import {
  getSessions, subscribeSessions, deleteSession, renameSession,
  type Session,
} from '../session-manager';
import {
  getArtifacts, subscribeArtifacts, removeArtifact, downloadArtifact,
  type Artifact,
} from '../artifacts';
import { downloadAllArtifacts } from './FilesPanel';

// Icons
import iconArrowDownload from '../icons/fluent/arrow-download.svg?url';
import iconBranchRequest from '../icons/fluent/branch-request.svg?url';

interface SessionsSidebarProps {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  selectedFileId: string | null;
  onSelectFile: (id: string | null) => void;
  /** Called when user clicks the PR button — should send a prompt into the conversation */
  onCreatePR?: () => void;
}

export function SessionsSidebar({
  activeSessionId, onSelectSession, onNewSession,
  selectedFileId, onSelectFile, onCreatePR,
}: SessionsSidebarProps) {
  const sessions = useSyncExternalStore(subscribeSessions, getSessions);
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return React.createElement('div', {
      style: {
        width: '36px', flexShrink: 0, height: '100%',
        borderRight: '1px solid var(--adaptive-border, #e5e7eb)',
        backgroundColor: 'var(--adaptive-surface, #fff)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '8px', gap: '8px',
      } as React.CSSProperties,
    },
      React.createElement('button', {
        onClick: () => setCollapsed(false),
        title: 'Expand sessions',
        style: {
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '14px', color: 'var(--adaptive-text-secondary, #6b7280)',
          padding: '4px',
        },
      }, '\u25B6'),
      React.createElement('button', {
        onClick: onNewSession,
        title: 'New session',
        style: {
          background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
          borderRadius: '4px', cursor: 'pointer',
          fontSize: '14px', color: 'var(--adaptive-text-secondary, #6b7280)',
          width: '24px', height: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, '+')
    );
  }

  return React.createElement('div', {
    style: {
      width: '100%', height: '100%',
      borderRight: '1px solid var(--adaptive-border, #e5e7eb)',
      backgroundColor: 'var(--adaptive-surface, #fff)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    } as React.CSSProperties,
  },
    // Header
    React.createElement('div', {
      style: {
        padding: '10px 12px', borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      },
    },
      React.createElement('span', {
        style: { fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #111827)' },
      }, 'Sessions'),
      React.createElement('div', { style: { display: 'flex', gap: '4px' } },
        React.createElement('button', {
          onClick: onNewSession,
          title: 'New session',
          style: {
            background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)',
            borderRadius: '4px', cursor: 'pointer',
            fontSize: '13px', color: 'var(--adaptive-text-secondary, #6b7280)',
            width: '22px', height: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
        }, '+'),
        React.createElement('button', {
          onClick: () => setCollapsed(true),
          title: 'Collapse',
          style: {
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '12px', color: 'var(--adaptive-text-secondary, #6b7280)',
            padding: '2px',
          },
        }, '\u25C0')
      )
    ),

    // Session list
    React.createElement('div', {
      style: { flex: 1, overflow: 'auto', minHeight: 0 } as React.CSSProperties,
    },
      sessions.length === 0
        ? React.createElement('div', {
            style: { padding: '16px 10px', fontSize: '13px', color: 'var(--adaptive-text-secondary, #6b7280)', textAlign: 'center' as const },
          }, 'No saved sessions')
        : sessions.map((session) =>
            React.createElement(SessionItem, {
              key: session.id,
              session,
              isActive: session.id === activeSessionId,
              onSelect: () => onSelectSession(session.id),
              onDelete: () => deleteSession(session.id),
              onRename: (name: string) => renameSession(session.id, name),
            })
          )
    ),

    // ─── Files section ───
    React.createElement('div', {
      style: {
        borderTop: '1px solid var(--adaptive-border, #e5e7eb)',
        display: 'flex', flexDirection: 'column',
        minHeight: '80px', maxHeight: '50%',
        flex: artifacts.length > 0 ? '0 1 auto' : '0 0 auto',
      } as React.CSSProperties,
    },
      // Files header
      React.createElement('div', {
        style: {
          padding: '10px 12px',
          borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        },
      },
        React.createElement('span', {
          style: { fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text, #111827)' },
        }, `Files (${artifacts.length})`),
        artifacts.length > 0 && React.createElement('div', { style: { display: 'flex', gap: '4px' } },
          React.createElement('button', {
            onClick: () => downloadAllArtifacts(artifacts),
            title: 'Download all files',
            style: {
              background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
              color: 'var(--adaptive-text, #111827)', cursor: 'pointer', padding: '2px 4px',
              display: 'flex', alignItems: 'center',
            },
          }, React.createElement('img', { src: iconArrowDownload, alt: 'Download all', width: 14, height: 14, style: { opacity: 0.7 } })),
          React.createElement('button', {
            onClick: onCreatePR,
            title: 'Create pull request on GitHub',
            disabled: !onCreatePR,
            style: {
              background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
              color: 'var(--adaptive-text, #111827)', cursor: onCreatePR ? 'pointer' : 'default', padding: '2px 4px',
              display: 'flex', alignItems: 'center',
              opacity: onCreatePR ? 1 : 0.4,
            },
          }, React.createElement('img', { src: iconBranchRequest, alt: 'Create PR', width: 14, height: 14, style: { opacity: 0.7 } }))
        )
      ),

      // File list
      React.createElement('div', {
        style: { flex: 1, overflow: 'auto' } as React.CSSProperties,
      },
        artifacts.length === 0
          ? React.createElement('div', {
              style: { padding: '12px 10px', fontSize: '13px', color: 'var(--adaptive-text-secondary, #6b7280)', textAlign: 'center' as const },
            }, 'No files yet')
          : artifacts.map((artifact) =>
              React.createElement(FileItem, {
                key: artifact.id,
                artifact,
                isSelected: artifact.id === selectedFileId,
                onSelect: () => onSelectFile(artifact.id),
                onRemove: () => {
                  removeArtifact(artifact.id);
                  if (selectedFileId === artifact.id) onSelectFile(null);
                },
                onDownload: () => downloadArtifact(artifact),
              })
            )
      )
    )
  );
}

function SessionItem({
  session, isActive, onSelect, onDelete, onRename,
}: {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const timeAgo = formatTimeAgo(session.updatedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return React.createElement('div', {
    onClick: onSelect,
    style: {
      padding: '10px 12px', cursor: 'pointer',
      backgroundColor: isActive ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
      borderLeft: isActive ? '3px solid var(--adaptive-primary, #2563eb)' : '3px solid transparent',
      borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    } as React.CSSProperties,
  },
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      editing
        ? React.createElement('input', {
            value: draft,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
            onBlur: commitRename,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setDraft(session.name); setEditing(false); }
            },
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            autoFocus: true,
            style: {
              fontSize: '13px', fontWeight: 500, width: '100%',
              padding: '2px 4px', border: '1px solid var(--adaptive-primary, #2563eb)',
              borderRadius: '4px', outline: 'none',
              background: 'var(--adaptive-surface, #fff)',
              color: 'var(--adaptive-text, #111827)',
            },
          })
        : React.createElement('div', {
            onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); setDraft(session.name); setEditing(true); },
            style: {
              fontSize: '13px', fontWeight: isActive ? 600 : 400,
              color: 'var(--adaptive-text, #111827)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
            },
          }, session.name),
      React.createElement('div', {
        style: { fontSize: '11px', color: 'var(--adaptive-text-secondary, #6b7280)', marginTop: '2px' },
      }, `${session.turnCount} turns \u00B7 ${timeAgo}`)
    ),
    React.createElement('button', {
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(); },
      title: 'Delete session',
      style: {
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '11px', color: 'var(--adaptive-text-secondary, #6b7280)',
        padding: '0 2px', flexShrink: 0, marginLeft: '4px',
        opacity: 0.5,
      },
    }, '\u2715')
  );
}

function FileItem({
  artifact, isSelected, onSelect, onRemove, onDownload,
}: {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const icon = artifact.filename.endsWith('.mmd') ? '\uD83D\uDCC8'
    : artifact.filename.endsWith('.md') ? '\uD83D\uDCC4'
    : '\uD83D\uDCBE';

  return React.createElement('div', {
    onClick: onSelect,
    style: {
      padding: '8px 12px', cursor: 'pointer',
      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
      borderLeft: isSelected ? '3px solid var(--adaptive-primary, #2563eb)' : '3px solid transparent',
      borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
      display: 'flex', alignItems: 'center', gap: '6px',
      fontSize: '13px',
    } as React.CSSProperties,
  },
    React.createElement('span', { style: { fontSize: '14px', flexShrink: 0 } }, icon),
    React.createElement('div', {
      style: {
        flex: 1, minWidth: 0,
        fontFamily: 'monospace', fontSize: '13px',
        color: 'var(--adaptive-text, #111827)',
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
      },
    }, artifact.filename),
    React.createElement('div', {
      style: { display: 'flex', gap: '2px', flexShrink: 0 },
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    },
      React.createElement('button', {
        onClick: onDownload,
        title: 'Download',
        style: {
          background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
          cursor: 'pointer', fontSize: '11px', padding: '2px', opacity: 0.6,
        },
      }, '\u2913'),
      React.createElement('button', {
        onClick: onRemove,
        title: 'Remove',
        style: {
          background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
          cursor: 'pointer', fontSize: '11px', padding: '2px', opacity: 0.6,
        },
      }, '\u2715')
    )
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
