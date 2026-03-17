// ─── Files Panel ───
// Shows saved artifacts (code blocks) in a sidebar panel.
// Supports viewing, downloading, and removing artifacts.

import React, { useSyncExternalStore, useState } from 'react';
import { getArtifacts, subscribeArtifacts, downloadArtifact, removeArtifact, clearArtifacts, type Artifact } from '../artifacts';

/** Download all artifacts as individual files (triggers multiple downloads) */
export function downloadAllArtifacts(artifacts: Artifact[]) {
  for (const artifact of artifacts) {
    downloadArtifact(artifact);
  }
}

/** Commit artifacts to an existing PR branch */
export async function updatePullRequestBranch(
  artifacts: Artifact[],
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  commitMessage: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const api = (path: string, opts?: RequestInit) =>
    fetch(`https://api.github.com${path}`, { ...opts, headers });

  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    onProgress?.(`Updating ${artifact.filename} (${i + 1}/${artifacts.length})...`);

    let sha: string | undefined;
    try {
      const checkRes = await api(
        `/repos/${owner}/${repo}/contents/${artifact.filename}?ref=${branchName}`
      );
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }
    } catch { /* file doesn't exist yet */ }

    const body: Record<string, unknown> = {
      message: `${commitMessage}: ${artifact.filename}`,
      content: btoa(unescape(encodeURIComponent(artifact.content))),
      branch: branchName,
    };
    if (sha) body.sha = sha;

    const res = await api(`/repos/${owner}/${repo}/contents/${artifact.filename}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to update ${artifact.filename}: ${(err as any)?.message || res.status}`);
    }
  }
}

/** Create a PR with artifacts committed to a new branch */
export async function createPullRequest(
  artifacts: Artifact[],
  token: string,
  owner: string,
  repo: string,
  baseBranch: string,
  commitMessage: string,
  onProgress?: (msg: string) => void
): Promise<{ url: string; branchName: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const api = (path: string, opts?: RequestInit) =>
    fetch(`https://api.github.com${path}`, { ...opts, headers });

  // 1. Get the base branch SHA
  onProgress?.('Getting base branch...');
  const refRes = await api(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
  if (!refRes.ok) throw new Error(`Base branch "${baseBranch}" not found (${refRes.status})`);
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  // 2. Create a new branch
  const branchName = `adaptive-ui/${Date.now()}`;
  onProgress?.(`Creating branch ${branchName}...`);
  const createBranchRes = await api(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!createBranchRes.ok) {
    const err = await createBranchRes.json().catch(() => ({}));
    throw new Error(`Failed to create branch: ${(err as any)?.message || createBranchRes.status}`);
  }

  // 3. Commit each file to the new branch
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    onProgress?.(`Committing ${artifact.filename} (${i + 1}/${artifacts.length})...`);

    // Check if file exists on the branch (to get SHA for updates)
    let sha: string | undefined;
    try {
      const checkRes = await api(
        `/repos/${owner}/${repo}/contents/${artifact.filename}?ref=${branchName}`
      );
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }
    } catch { /* file doesn't exist */ }

    const body: Record<string, unknown> = {
      message: `${commitMessage}: ${artifact.filename}`,
      content: btoa(unescape(encodeURIComponent(artifact.content))),
      branch: branchName,
    };
    if (sha) body.sha = sha;

    const res = await api(`/repos/${owner}/${repo}/contents/${artifact.filename}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to commit ${artifact.filename}: ${(err as any)?.message || res.status}`);
    }
  }

  // 4. Create the pull request
  onProgress?.('Creating pull request...');
  const prRes = await api(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: commitMessage,
      head: branchName,
      base: baseBranch,
      body: `Generated by Solution Architect Coworker.\n\n**Files:**\n${artifacts.map(a => '- `' + a.filename + '`').join('\n')}`,
    }),
  });
  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({}));
    throw new Error(`Failed to create PR: ${(err as any)?.message || prRes.status}`);
  }
  const prData = await prRes.json();
  return { url: prData.html_url, branchName };
}

export function FilesPanel() {
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCommit, setShowCommit] = useState(false);
  const [commitMsg, setCommitMsg] = useState('Add generated infrastructure files');
  const [commitBranch, setCommitBranch] = useState('main');
  const [committing, setCommitting] = useState(false);
  const [commitStatus, setCommitStatus] = useState<string | null>(null);
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
      artifacts.length > 0 && React.createElement('div', { style: { display: 'flex', gap: '4px' } },
        React.createElement('button', {
          onClick: () => downloadAllArtifacts(artifacts),
          title: 'Download all files',
          style: {
            background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
            color: 'var(--adaptive-text, #111827)', cursor: 'pointer', fontSize: '10px', padding: '2px 6px',
          },
        }, '\u2913 All'),
        React.createElement('button', {
          onClick: () => setShowCommit(true),
          title: 'Push files to GitHub',
          style: {
            background: 'none', border: '1px solid var(--adaptive-border, #e5e7eb)', borderRadius: '4px',
            color: 'var(--adaptive-text, #111827)', cursor: 'pointer', fontSize: '10px', padding: '2px 6px',
          },
        }, '\u2B22 PR'),
        React.createElement('button', {
          onClick: clearArtifacts,
          title: 'Clear all files',
          style: {
            background: 'none', border: 'none', color: 'var(--adaptive-text-secondary, #6b7280)',
            cursor: 'pointer', fontSize: '10px',
          },
        }, 'Clear')
      )
    ),

    // Commit to GitHub dialog
    showCommit && React.createElement('div', {
      style: {
        padding: '10px 12px', borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
        backgroundColor: '#f9fafb', fontSize: '11px',
      },
    },
      React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, 'Create Pull Request'),
      React.createElement('input', {
        type: 'text',
        value: commitBranch,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCommitBranch(e.target.value),
        placeholder: 'Base branch (e.g., main)',
        style: { width: '100%', padding: '4px 8px', fontSize: '11px', marginBottom: '4px', borderRadius: '4px', border: '1px solid #d1d5db' },
      }),
      React.createElement('input', {
        type: 'text',
        value: commitMsg,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCommitMsg(e.target.value),
        placeholder: 'PR title / commit message',
        style: { width: '100%', padding: '4px 8px', fontSize: '11px', marginBottom: '6px', borderRadius: '4px', border: '1px solid #d1d5db' },
      }),
      commitStatus && React.createElement('div', {
        style: {
          fontSize: '10px', marginBottom: '4px', padding: '4px',
          color: commitStatus.startsWith('Error') ? '#dc2626' : commitStatus.startsWith('\u2713') ? '#16a34a' : '#6b7280',
        },
      }, commitStatus),
      React.createElement('div', { style: { display: 'flex', gap: '4px' } },
        React.createElement('button', {
          onClick: async () => {
            // Read GitHub state from localStorage
            const token = (() => { try { return localStorage.getItem('adaptive-ui-github-token') || ''; } catch { return ''; } })();
            const stateRaw = (() => { try { return localStorage.getItem('adaptive-ui-state') || '{}'; } catch { return '{}'; } })();
            let owner = '', repo = '';
            try {
              const s = JSON.parse(stateRaw);
              owner = s.githubOrg || s.__githubUser || '';
              repo = s.githubRepo || '';
            } catch {}
            // Also try reading from the running app state via a data attribute
            if (!owner || !repo) {
              const el = document.querySelector('[data-github-org]');
              if (el) {
                owner = owner || (el as HTMLElement).dataset.githubOrg || '';
                repo = repo || (el as HTMLElement).dataset.githubRepo || '';
              }
            }
            if (!token) { setCommitStatus('Error: Not signed in to GitHub. Sign in first.'); return; }
            if (!owner || !repo) { setCommitStatus('Error: No repository selected. Pick an org and repo first.'); return; }

            setCommitting(true);
            setCommitStatus(null);
            try {
              const result = await createPullRequest(artifacts, token, owner, repo, commitBranch, commitMsg, setCommitStatus);
              setCommitStatus(`\u2713 PR created: ${result.url}`);
              // Open PR in new tab
              window.open(result.url, '_blank', 'noopener,noreferrer');
            } catch (err) {
              setCommitStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setCommitting(false);
            }
          },
          disabled: committing || !commitBranch.trim() || !commitMsg.trim(),
          style: {
            flex: 1, padding: '4px', borderRadius: '4px', border: 'none',
            backgroundColor: '#24292e', color: '#fff', fontSize: '10px', fontWeight: 500,
            cursor: committing ? 'wait' : 'pointer', opacity: committing ? 0.6 : 1,
          },
        }, committing ? 'Creating PR...' : `Create PR (${artifacts.length} files)`),
        React.createElement('button', {
          onClick: () => { setShowCommit(false); setCommitStatus(null); },
          style: {
            padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db',
            background: '#fff', fontSize: '10px', cursor: 'pointer',
          },
        }, 'Cancel')
      )
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
