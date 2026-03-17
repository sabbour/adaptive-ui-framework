import React, { useEffect, useState } from 'react';
import type { AdaptiveComponentProps } from '../../framework/registry';
import type { AdaptiveNodeBase } from '../../framework/schema';
import { useAdaptive } from '../../framework/context';
import { trackedFetch } from '../../framework/request-tracker';
import { SearchableDropdown } from '../../framework/components/builtins';
import {
  getStoredToken, getStoredClientId,
  requestDeviceCode, pollForToken,
} from './auth';

// ─── Helpers ───

function useGitHubToken(): string | undefined {
  const { state } = useAdaptive();
  return (state.__githubToken as string) || undefined;
}

function LoadingSpinner({ label }: { label: string }) {
  return React.createElement('div', {
    style: { padding: '12px', color: '#6b7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
  },
    React.createElement('div', {
      style: {
        width: '16px', height: '16px', border: '2px solid #e5e7eb',
        borderTopColor: '#2563eb', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      },
    }),
    label
  );
}

function Banner({ message, type }: { message: string; type: 'error' | 'warning' }) {
  const styles = type === 'error'
    ? { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
    : { backgroundColor: '#fffbeb', border: '1px solid #fed7aa', color: '#92400e' };
  return React.createElement('div', {
    style: { padding: '10px 14px', borderRadius: '8px', fontSize: '13px', ...styles },
  }, message);
}

// ═══════════════════════════════════════
// GitHub Login (OAuth Device Flow)
// ═══════════════════════════════════════

interface GitHubLoginNode extends AdaptiveNodeBase {
  type: 'githubLogin';
  title?: string;
  description?: string;
}

export function GitHubLogin({ node }: AdaptiveComponentProps<GitHubLoginNode>) {
  const { state, dispatch, sendPrompt } = useAdaptive();
  const token = (state.__githubToken as string) || undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ login: string; name: string | null; avatar_url: string } | null>(null);
  const [deviceCode, setDeviceCode] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const clientId = getStoredClientId();

  // Check for token stored in settings on mount
  useEffect(() => {
    if (token) return;
    const stored = getStoredToken();
    if (stored) {
      dispatch({ type: 'SET', key: '__githubToken', value: stored });
    }
  }, []);

  // Validate existing token on mount
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    trackedFetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`GitHub API: ${res.status}`)))
      .then((data) => {
        setUser({ login: data.login, name: data.name, avatar_url: data.avatar_url });
        dispatch({ type: 'SET', key: '__githubUser', value: data.login });
      })
      .catch(() => {
        dispatch({ type: 'SET', key: '__githubToken', value: '' });
        setError('Token expired or invalid. Please sign in again.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleOAuth = async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const code = await requestDeviceCode(clientId);
      setDeviceCode({ user_code: code.user_code, verification_uri: code.verification_uri });
      setPolling(true);
      window.open(code.verification_uri, '_blank', 'noopener,noreferrer');
      const login = await pollForToken(clientId, code.device_code);
      const storedToken = getStoredToken();
      if (storedToken) {
        dispatch({ type: 'SET', key: '__githubToken', value: storedToken });
        dispatch({ type: 'SET', key: '__githubUser', value: login });
        setUser({ login, name: null, avatar_url: '' });
      }
      setDeviceCode(null);
      setPolling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed');
      setDeviceCode(null);
      setPolling(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !deviceCode) {
    return React.createElement(LoadingSpinner, { label: 'Connecting to GitHub...' });
  }

  // Authenticated
  if (token && user) {
    return React.createElement('div', {
      style: { ...node.style } as React.CSSProperties,
    },
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderRadius: '8px',
          backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
        },
      },
        user.avatar_url && React.createElement('img', {
          src: user.avatar_url,
          alt: user.login,
          style: { width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 },
        }),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '14px', fontWeight: 500, color: '#166534' } },
            `Signed in as ${user.login}`
          ),
          user.name && React.createElement('div', { style: { fontSize: '12px', color: '#15803d' } },
            user.name
          )
        )
      ),
      // Continue button — advances the conversation after sign-in
      React.createElement('button', {
        onClick: () => sendPrompt(
          `Signed in to GitHub as ${user.login}`,
          null
        ),
        style: {
          marginTop: '12px', width: '100%', padding: '10px',
          borderRadius: '8px', border: 'none',
          fontSize: '14px', fontWeight: 500, cursor: 'pointer',
          backgroundColor: 'var(--adaptive-primary, #2563eb)', color: '#fff',
        },
      }, 'Continue')
    );
  }

  // Login form
  return React.createElement('div', {
    style: {
      padding: '20px', borderRadius: '10px',
      border: '1px solid #e5e7eb', backgroundColor: '#f9fafb',
      ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
    },
      React.createElement('div', {
        style: {
          width: '36px', height: '36px', borderRadius: '8px',
          backgroundColor: '#24292e', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', fontWeight: 700, flexShrink: 0,
        },
      }, '\u2B22'),
      React.createElement('div', null,
        React.createElement('div', { style: { fontSize: '15px', fontWeight: 600 } },
          node.title ?? 'Connect to GitHub'
        ),
        React.createElement('div', { style: { fontSize: '13px', color: '#6b7280' } },
          node.description ?? 'Sign in with your GitHub account to access repos, issues, and workflows.'
        )
      )
    ),

    error && React.createElement(Banner, { message: error, type: 'error' }),

    // Device code display (OAuth in progress)
    deviceCode && React.createElement('div', {
      style: {
        padding: '16px', borderRadius: '8px', marginTop: '8px',
        backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
        textAlign: 'center' as const,
      },
    },
      React.createElement('div', {
        style: { fontSize: '12px', color: '#1e40af', marginBottom: '6px' },
      }, 'A browser tab has opened. Enter this code at github.com/login/device:'),
      React.createElement('div', {
        style: { fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', color: '#1e3a8a', letterSpacing: '4px', margin: '8px 0' },
      }, deviceCode.user_code),
      polling && React.createElement('div', {
        style: { fontSize: '11px', color: '#6b7280', marginTop: '6px' },
      }, 'Waiting for authorization...')
    ),

    // Sign in button
    !deviceCode && React.createElement('button', {
      onClick: handleOAuth,
      disabled: loading,
      style: {
        width: '100%', padding: '10px', borderRadius: '8px',
        border: 'none', fontSize: '14px', fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        backgroundColor: '#24292e', color: '#fff',
        opacity: loading ? 0.7 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        marginTop: error ? '8px' : '0',
      },
    }, 'Sign in with GitHub')
  );
}

// ═══════════════════════════════════════
// GitHub Query (generic GitHub API caller)
// ═══════════════════════════════════════

interface GitHubQueryNode extends AdaptiveNodeBase {
  type: 'githubQuery';
  /** GitHub API path (e.g., "/repos/{owner}/{repo}/issues"). Supports {{state.key}} interpolation. */
  api: string;
  /** HTTP method. Default: GET */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** State key to store the result under */
  bind: string;
  /** Optional request body (JSON string with {{state.key}} interpolation) */
  body?: string;
  /** Loading label */
  loadingLabel?: string;
  /** Show raw result */
  showResult?: boolean;
  /** Require confirmation for write operations */
  confirm?: boolean;
}

export function GitHubQuery({ node }: AdaptiveComponentProps<GitHubQueryNode>) {
  const token = useGitHubToken();
  const { state, dispatch } = useAdaptive();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);

  const method = node.method ?? 'GET';
  const needsConfirm = node.confirm ?? method !== 'GET';

  // Simple interpolation for the API path
  const resolvedApi = node.api.replace(/\{\{(?:state|st)\.(.+?)\}\}/g, (_m, key) => {
    const val = state[key];
    return val != null ? String(val) : '';
  });

  const isReady = !!token && !resolvedApi.includes('//') && resolvedApi.length > 1;

  useEffect(() => {
    if (!isReady || method !== 'GET') return;
    executeQuery();
  }, [isReady, resolvedApi]);

  async function executeQuery() {
    if (!isReady) return;
    setLoading(true);
    setError(null);
    try {
      const url = resolvedApi.startsWith('http')
        ? resolvedApi
        : `https://api.github.com${resolvedApi}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      };

      const fetchOpts: RequestInit = { method, headers };
      if (node.body && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const resolvedBody = node.body.replace(/\{\{(?:state|st)\.(.+?)\}\}/g, (_m, key) => {
          const val = state[key];
          return val != null ? String(val) : '';
        });
        fetchOpts.body = resolvedBody;
      }

      const res = await trackedFetch(url, fetchOpts);
      const data = res.status !== 204 ? await res.json() : null;

      if (!res.ok) {
        const errMsg = data?.message ?? `GitHub API error (${res.status})`;
        setError(errMsg);
        return;
      }

      const resultStr = JSON.stringify(data);
      setResult(data);
      dispatch({ type: 'SET', key: node.bind, value: resultStr });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return React.createElement(Banner, { message: 'Connect to GitHub first.', type: 'warning' });
  }

  if (loading) {
    return React.createElement(LoadingSpinner, { label: node.loadingLabel ?? 'Fetching from GitHub...' });
  }

  if (error) {
    return React.createElement('div', { style: node.style },
      React.createElement(Banner, { message: error, type: 'error' }),
      React.createElement('button', {
        onClick: executeQuery,
        style: {
          marginTop: '8px', padding: '6px 12px', borderRadius: '6px',
          border: '1px solid #d1d5db', background: '#fff',
          fontSize: '12px', cursor: 'pointer',
        },
      }, 'Retry')
    );
  }

  // Write operations — confirmation
  if (needsConfirm && !confirmed) {
    return React.createElement('div', {
      style: {
        padding: '14px', borderRadius: '8px',
        border: '1px solid #fed7aa', backgroundColor: '#fffbeb', ...node.style,
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: { fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#92400e' },
      }, typeof node.confirm === 'string' ? node.confirm : `Confirm ${method} operation`),
      React.createElement('div', {
        style: { fontSize: '12px', color: '#92400e', marginBottom: '12px', fontFamily: 'monospace', wordBreak: 'break-all' as const },
      }, `${method} ${resolvedApi}`),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', {
          onClick: () => { setConfirmed(true); executeQuery(); },
          style: {
            padding: '8px 16px', borderRadius: '6px',
            border: 'none', backgroundColor: '#24292e', color: '#fff',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          },
        }, `Execute ${method}`),
        React.createElement('button', {
          onClick: () => dispatch({ type: 'SET', key: `${node.bind}_cancelled`, value: 'true' }),
          style: {
            padding: '8px 16px', borderRadius: '6px',
            border: '1px solid #d1d5db', backgroundColor: '#fff',
            fontSize: '13px', cursor: 'pointer',
          },
        }, 'Cancel')
      )
    );
  }

  // Success — show result
  if (result && node.showResult) {
    return React.createElement('div', {
      style: {
        padding: '8px 12px', borderRadius: '8px',
        backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
        fontSize: '12px', color: '#166534', ...node.style,
      } as React.CSSProperties,
    }, Array.isArray(result)
      ? `\u2713 ${result.length} items loaded`
      : '\u2713 Operation completed'
    );
  }

  if (result) {
    return React.createElement('div', {
      style: {
        padding: '8px 12px', borderRadius: '8px',
        backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
        fontSize: '12px', color: '#166534', ...node.style,
      } as React.CSSProperties,
    }, `\u2713 ${Array.isArray(result) ? result.length + ' items loaded' : 'Done'}`);
  }

  return null;
}

// ═══════════════════════════════════════
// GitHub Repo Info (shows repo card)
// ═══════════════════════════════════════

interface GitHubRepoInfoNode extends AdaptiveNodeBase {
  type: 'githubRepoInfo';
  /** Owner/repo string, e.g., "microsoft/vscode". Supports {{state.key}} interpolation. */
  repo: string;
}

export function GitHubRepoInfo({ node }: AdaptiveComponentProps<GitHubRepoInfoNode>) {
  const token = useGitHubToken();
  const { state } = useAdaptive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<any>(null);

  const resolvedRepo = node.repo.replace(/\{\{(?:state|st)\.(.+?)\}\}/g, (_m, key) => {
    const val = state[key];
    return val != null ? String(val) : '';
  });

  useEffect(() => {
    if (!token || !resolvedRepo) return;
    setLoading(true);
    trackedFetch(`https://api.github.com/repos/${resolvedRepo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`${res.status}`)))
      .then(setRepo)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, resolvedRepo]);

  if (!token) return React.createElement(Banner, { message: 'Connect to GitHub first.', type: 'warning' });
  if (loading) return React.createElement(LoadingSpinner, { label: `Loading ${resolvedRepo}...` });
  if (error) return React.createElement(Banner, { message: `Failed to load repo: ${error}`, type: 'error' });
  if (!repo) return null;

  return React.createElement('div', {
    style: {
      padding: '16px', borderRadius: '10px',
      border: '1px solid #e5e7eb', backgroundColor: '#fff',
      ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
    },
      React.createElement('img', {
        src: repo.owner?.avatar_url, alt: '',
        style: { width: '24px', height: '24px', borderRadius: '50%' },
      }),
      React.createElement('a', {
        href: repo.html_url, target: '_blank', rel: 'noopener noreferrer',
        style: { fontSize: '15px', fontWeight: 600, color: '#0969da', textDecoration: 'none' },
      }, repo.full_name)
    ),
    repo.description && React.createElement('div', {
      style: { fontSize: '13px', color: '#6b7280', marginBottom: '10px' },
    }, repo.description),
    React.createElement('div', {
      style: { display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280' },
    },
      repo.language && React.createElement('span', null, `\u{1F4BB} ${repo.language}`),
      React.createElement('span', null, `\u2B50 ${repo.stargazers_count.toLocaleString()}`),
      React.createElement('span', null, `\uD83C\uDF74 ${repo.forks_count.toLocaleString()}`),
      repo.open_issues_count > 0 && React.createElement('span', null, `\u26A0 ${repo.open_issues_count} issues`)
    )
  );
}

// ═══════════════════════════════════════
// GitHub Picker (fetch API data → searchable dropdown, client-side)
// ═══════════════════════════════════════

/** Parse GitHub Link header for next page URL */
function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

interface GitHubPickerNode extends AdaptiveNodeBase {
  type: 'githubPicker';
  /** GitHub API path (e.g. "/user/orgs"). Supports {{state.key}} interpolation. */
  api: string;
  /** State key to store the selected value */
  bind: string;
  /** Optional state key to store the selected label */
  labelBind?: string;
  /** Label shown above the dropdown */
  label?: string;
  /** Key to use as the option label (default: "name") */
  labelKey?: string;
  /** Key to use as the option value (default: "login" for orgs, "name" for repos) */
  valueKey?: string;
  /** Optional description key shown below each option label */
  descriptionKey?: string;
  /** Loading label */
  loadingLabel?: string;
  /** Whether to include a "Personal account" option (for org pickers) */
  includePersonal?: boolean;
}

export function GitHubPicker({ node }: AdaptiveComponentProps<GitHubPickerNode>) {
  const token = useGitHubToken();
  const { state, dispatch } = useAdaptive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ label: string; value: string; description?: string }>>([]);

  const api = node.api.replace(/\{\{(?:state|st)\.(.+?)\}\}/g, (_m, key) => {
    const val = state[key];
    return val != null ? String(val) : '';
  });

  useEffect(() => {
    if (!token || !api) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch with auto-pagination (up to 300 items)
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
        const url = api.startsWith('http') ? api : `https://api.github.com${api}`;
        // Add per_page=100 if not already specified
        const fetchUrl = url.includes('per_page') ? url : url + (url.includes('?') ? '&' : '?') + 'per_page=100';

        const allItems: any[] = [];
        let nextUrl: string | null = fetchUrl;

        while (nextUrl && allItems.length < 300) {
          const res = await trackedFetch(nextUrl, { headers });
          if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
          const data = await res.json();
          if (Array.isArray(data)) {
            allItems.push(...data);
          } else {
            allItems.push(data);
            break;
          }
          nextUrl = parseNextLink(res.headers.get('link'));
        }

        if (cancelled) return;

        const labelKey = node.labelKey ?? 'name';
        const valueKey = node.valueKey ?? 'login';
        const descKey = node.descriptionKey;

        const mapped = allItems.map(item => ({
          label: String(item[labelKey] ?? item.name ?? item.login ?? ''),
          value: String(item[valueKey] ?? ''),
          description: descKey ? String(item[descKey] ?? '') : undefined,
        })).sort((a, b) => a.label.localeCompare(b.label));

        // Optionally prepend personal account
        if (node.includePersonal) {
          const username = state.__githubUser as string;
          if (username) {
            mapped.unshift({ label: `${username} (personal)`, value: username, description: undefined });
          }
        }

        setOptions(mapped);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [token, api]);

  if (!token) {
    return React.createElement(Banner, { message: 'Connect to GitHub first.', type: 'warning' });
  }

  if (loading) {
    return React.createElement(LoadingSpinner, { label: node.loadingLabel ?? 'Loading...' });
  }

  if (error) {
    return React.createElement(Banner, { message: error, type: 'error' });
  }

  return React.createElement('div', { style: { marginBottom: '12px', ...node.style } as React.CSSProperties },
    node.label && React.createElement('label', {
      style: { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' },
    }, node.label),
    React.createElement(SearchableDropdown, {
      options,
      value: (state[node.bind] as string) ?? '',
      onChange: (val: string) => {
        const selected = options.find(o => o.value === val);
        dispatch({ type: 'SET', key: node.bind, value: val });
        if (node.labelBind && selected) {
          dispatch({ type: 'SET', key: node.labelBind, value: selected.label });
        }
      },
      placeholder: `\u2014 Select (${options.length} available) \u2014`,
    })
  );
}
