import React, { useEffect, useState } from 'react';
import type { AdaptiveComponentProps } from '../../framework/registry';
import type { AdaptiveNodeBase } from '../../framework/schema';
import { useAdaptive } from '../../framework/context';
import { interpolate } from '../../framework/interpolation';
import { fetchResourceTypeSchema, type ArmResourceSchema } from './arm-introspection';
import { azureLogin, getActiveAccount } from './auth';
import { getAzureIconUrl } from './icon-resolver';
import { fetchSubscriptions } from './arm-introspection';
import { SearchableDropdown } from '../../framework/components/builtins';

// Icons
import iconAzureA from './icons/Other/Azure A.svg?url';
import iconMicrosoft from './icons/microsoft-logo.svg?url';
import { trackedFetch } from '../../framework/request-tracker';

// ─── Helpers ───

function useAzureToken(): string | undefined {
  const { state } = useAdaptive();
  return (state.__azureToken as string) || undefined;
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

// Fetch subscriptions and store in state for the LLM to use
async function fetchAndStoreSubscriptions(
  token: string,
  dispatch: (action: { type: 'SET'; key: string; value: string }) => void,
  currentSubscriptionId?: string
) {
  try {
    const subs = await fetchSubscriptions(token);
    const enabled = subs.filter((s) => s.state === 'Enabled');
    // Store as JSON string so it's available in state for interpolation
    dispatch({
      type: 'SET',
      key: '__azureSubscriptions',
      value: JSON.stringify(enabled.map((s) => ({ id: s.id, name: s.displayName }))),
    });
    // Auto-select only when there's exactly one enabled subscription.
    // If there are multiple, require explicit user selection.
    if (enabled.length === 1) {
      dispatch({ type: 'SET', key: '__azureSubscription', value: enabled[0].id });
      dispatch({ type: 'SET', key: '__azureSubscriptionName', value: enabled[0].displayName });
    }
  } catch {
    // Silently fail — subscriptions are optional
  }
}

// ═══════════════════════════════════════
// Azure Login (inline component)
// ═══════════════════════════════════════

interface AzureLoginNode extends AdaptiveNodeBase {
  type: 'azureLogin';
  title?: string;
  description?: string;
}

export function AzureLogin({ node }: AdaptiveComponentProps<AzureLoginNode>) {
  const { state, dispatch, disabled } = useAdaptive();
  const token = (state.__azureToken as string) || undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);

  // Check for existing session
  useEffect(() => {
    if (disabled) return;
    if (token) {
      // Already have token — fetch subscriptions if not loaded
      if (!state.__azureSubscriptions) {
        fetchAndStoreSubscriptions(token, dispatch, state.__azureSubscription as string | undefined);
      }
      return;
    }
    getActiveAccount().then((acct) => {
      if (acct) {
        dispatch({ type: 'SET', key: '__azureToken', value: acct.accessToken });
        setAccountName(acct.account.name || acct.account.username);
        fetchAndStoreSubscriptions(acct.accessToken, dispatch, state.__azureSubscription as string | undefined);
      }
    }).catch(() => {});
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await azureLogin();
      dispatch({ type: 'SET', key: '__azureToken', value: result.accessToken });
      setAccountName(result.account.name || result.account.username);
      await fetchAndStoreSubscriptions(result.accessToken, dispatch, state.__azureSubscription as string | undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Already authenticated
  if (token) {
    const subsRaw = state.__azureSubscriptions as string;
    const subs = subsRaw ? JSON.parse(subsRaw) as Array<{ id: string; name: string }> : [];

    return React.createElement('div', {
      style: { ...node.style } as React.CSSProperties,
    },
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderRadius: '8px',
          backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
          marginBottom: subs.length > 1 ? '12px' : '0',
        },
      },
        React.createElement('div', {
          style: {
            width: '32px', height: '32px', borderRadius: '50%',
            backgroundColor: '#22c55e', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: 700, flexShrink: 0,
          },
        }, '✓'),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: '14px', fontWeight: 500, color: '#166534' } },
            'Signed in to Azure'
          ),
          accountName && React.createElement('div', { style: { fontSize: '12px', color: '#15803d' } },
            accountName
          ),
          state.__azureSubscriptionName && React.createElement('div', { style: { fontSize: '12px', color: '#15803d' } },
            `Subscription: ${state.__azureSubscriptionName}`
          )
        )
      ),

      // Always show picker when multiple subscriptions are available so users can switch.
      subs.length > 1 && React.createElement(AzurePicker, {
        node: {
          type: 'azurePicker',
          api: '/subscriptions?api-version=2022-12-01',
          bind: '__azureSubscription',
          labelBind: '__azureSubscriptionName',
          label: 'Azure subscription',
          itemsPath: 'value',
          labelKey: 'displayName',
          valueKey: 'subscriptionId',
          filterKey: 'state',
          filterValue: 'Enabled',
          loadingLabel: 'Loading subscriptions...',
        } as any,
      })
      // Login complete — the intent resolver's Continue button handles submission.
      // No separate Continue button to avoid skipping sibling asks.
    );
  }

  // Login card
  return React.createElement('div', {
    style: {
      padding: '20px', borderRadius: '10px',
      border: '1px solid #bae6fd', backgroundColor: '#f0f9ff',
      ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
    },
      React.createElement('div', {
        style: {
          width: '36px', height: '36px', borderRadius: '8px',
          backgroundColor: '#0078d4', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 700, flexShrink: 0,
        },
      }, 'A'),
      React.createElement('div', null,
        React.createElement('div', { style: { fontSize: '15px', fontWeight: 600 } },
          node.title ?? 'Sign in to Azure'
        ),
        React.createElement('div', { style: { fontSize: '13px', color: '#6b7280' } },
          node.description ?? 'Authentication is required to access Azure resources.'
        )
      )
    ),

    error && React.createElement('div', {
      style: { padding: '8px 10px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '12px', marginBottom: '10px' },
    }, error),

    React.createElement('button', {
      onClick: handleLogin,
      disabled: loading,
      style: {
        width: '100%', padding: '10px', borderRadius: '8px',
        border: 'none', fontSize: '14px', fontWeight: 500,
        cursor: loading ? 'wait' : 'pointer',
        backgroundColor: '#0078d4', color: '#fff',
        opacity: loading ? 0.7 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      },
    }, loading ? 'Signing in...' : React.createElement(React.Fragment, null, React.createElement('img', { src: iconMicrosoft, alt: '', width: 18, height: 18 }), 'Sign in with Microsoft'))
  );
}

// ═══════════════════════════════════════
// Azure Resource Form (dynamic from ARM)
// ═══════════════════════════════════════

interface AzureResourceFormNode extends AdaptiveNodeBase {
  type: 'azureResourceForm';
  resourceType: string;
  bind: string;
}

export function AzureResourceForm({ node }: AdaptiveComponentProps<AzureResourceFormNode>) {
  const token = useAzureToken();
  const { state, dispatch, disabled } = useAdaptive();
  const [schema, setSchema] = useState<ArmResourceSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled) return;
    if (!token) return;
    setLoading(true);
    fetchResourceTypeSchema(token, node.resourceType)
      .then(setSchema)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, node.resourceType]);

  if (!token) return React.createElement(Banner, { message: 'azureResourceForm requires __azureToken in state.', type: 'warning' });
  if (loading) return React.createElement(LoadingSpinner, { label: `Fetching schema for ${node.resourceType}...` });
  if (error) return React.createElement(Banner, { message: error, type: 'error' });
  if (!schema) return React.createElement(Banner, { message: `Could not resolve schema for ${node.resourceType}`, type: 'error' });

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '12px', ...node.style } as React.CSSProperties,
  },
    React.createElement('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', backgroundColor: '#f0f9ff', borderRadius: '6px',
        border: '1px solid #bae6fd', fontSize: '12px', color: '#0369a1',
      },
    },
      React.createElement('span', null, schema.resourceType),
      React.createElement('span', null, `API ${schema.apiVersion}`)
    ),

    ...schema.properties
      .filter((p) => !p.readOnly)
      .map((prop) => {
        const key = `${node.bind}_${prop.name}`;
        const value = (state[key] as string) ?? prop.default ?? '';

        if (prop.type === 'boolean') {
          const isOn = value === 'true';
          return React.createElement('label', {
            key: prop.name,
            onClick: () => dispatch({ type: 'SET', key, value: isOn ? 'false' : 'true' }),
            style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 0' },
          },
            React.createElement('div', {
              style: {
                width: '40px', height: '22px', borderRadius: '11px',
                backgroundColor: isOn ? '#2563eb' : '#d1d5db',
                position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
              } as React.CSSProperties,
            },
              React.createElement('div', {
                style: {
                  width: '18px', height: '18px', borderRadius: '50%',
                  backgroundColor: '#fff', position: 'absolute', top: '2px',
                  left: isOn ? '20px' : '2px', transition: 'left 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                } as React.CSSProperties,
              })
            ),
            React.createElement('div', null,
              React.createElement('span', { style: { fontSize: '14px', fontWeight: 500 } }, prop.name),
              prop.description && React.createElement('span', {
                style: { fontSize: '12px', color: '#6b7280', marginLeft: '8px' },
              }, prop.description)
            )
          );
        }

        if (prop.type === 'enum' && prop.enumValues) {
          return React.createElement('div', { key: prop.name },
            React.createElement('label', {
              style: { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' },
            }, prop.name),
            prop.description && React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginBottom: '4px' },
            }, prop.description),
            React.createElement('select', {
              value,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                dispatch({ type: 'SET', key, value: e.target.value }),
              style: {
                width: '100%', padding: '8px 10px', borderRadius: '6px',
                border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: '#fff',
              },
            },
              React.createElement('option', { value: '' }, `Select ${prop.name}...`),
              ...prop.enumValues.map((v) =>
                React.createElement('option', { key: v, value: v }, v)
              )
            )
          );
        }

        return React.createElement('div', { key: prop.name },
          React.createElement('label', {
            style: { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' },
          }, prop.name),
          prop.description && React.createElement('div', {
            style: { fontSize: '12px', color: '#6b7280', marginBottom: '4px' },
          }, prop.description),
          React.createElement('input', {
            type: prop.type === 'number' ? 'number' : 'text',
            value,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              dispatch({ type: 'SET', key, value: e.target.value }),
            placeholder: prop.default ?? `Enter ${prop.name}...`,
            style: {
              width: '100%', padding: '8px 10px', borderRadius: '6px',
              border: '1px solid #d1d5db', fontSize: '14px',
              boxSizing: 'border-box' as const,
            },
          })
        );
      })
  );
}

// ═══════════════════════════════════════
// Azure Query (generic ARM API caller)
// ═══════════════════════════════════════

interface AzureQueryNode extends AdaptiveNodeBase {
  type: 'azureQuery';
  /** ARM API path (supports {{state.key}} interpolation).
   *  e.g. "/subscriptions/{{state.__azureSubscription}}/resourceGroups?api-version=2022-09-01" */
  api: string;
  /** HTTP method. Default: GET */
  method?: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';
  /** State key to store the result under */
  bind: string;
  /** Optional request body (for PUT/POST/PATCH). Supports {{state.key}} interpolation. */
  body?: string;
  /** Optional label shown while loading */
  loadingLabel?: string;
  /** If true, show raw JSON result (for debugging). Default: false */
  showResult?: boolean;
  /** If true, requires user confirmation before executing (for write operations). Default: auto (true for non-GET) */
  confirm?: boolean;
}

const ARM_BASE = 'https://management.azure.com';

export function AzureQuery({ node }: AdaptiveComponentProps<AzureQueryNode>) {
  const token = useAzureToken();
  const { state, dispatch, disabled } = useAdaptive();
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);

  const method = node.method ?? 'GET';
  const needsConfirm = node.confirm ?? method !== 'GET';
  const resolvedApi = interpolate(node.api, state);
  const templateStateKeys = Array.from(node.api.matchAll(/{{\s*(?:state|st)\.([a-zA-Z0-9_]+)\s*}}/g)).map((m) => m[1]);
  const missingStateKeys = templateStateKeys.filter((k) => {
    const v = state[k];
    return v === undefined || v === null || String(v).trim() === '';
  });

  const subscriptionsRaw = state.__azureSubscriptions as string | undefined;
  const subscriptions = subscriptionsRaw
    ? JSON.parse(subscriptionsRaw) as Array<{ id: string; name: string }>
    : [];

  // Check if the resolved API path has unresolved interpolation (empty segments like //)
  const hasUnresolvedState = resolvedApi.includes('//') && resolvedApi !== 'https://' && !resolvedApi.startsWith('http');
  const isReady = !!token && !hasUnresolvedState;

  // Auto-execute GET requests on mount (only when all state values are resolved)
  useEffect(() => {
    if (disabled) return;
    if (!isReady || method !== 'GET') return;
    executeQuery();
  }, [disabled, isReady, resolvedApi]);

  async function executeQuery() {
    if (!isReady) return;
    setLoading(true);
    setError(null);
    try {
      const url = resolvedApi.startsWith('http') ? resolvedApi : `${ARM_BASE}${resolvedApi}`;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const fetchOpts: RequestInit = { method, headers };

      if (node.body && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
        fetchOpts.body = interpolate(node.body, state);
      }

      const res = await trackedFetch(url, fetchOpts);
      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message ?? `ARM API error (${res.status})`;
        setError(errMsg);
        dispatch({ type: 'SET', key: `${node.bind}_error`, value: errMsg });
        return;
      }

      // Store result in state — if it has a .value array (ARM list response), store that
      const resultData = data.value ?? data;
      const resultStr = JSON.stringify(resultData);
      setResult(resultData);
      dispatch({ type: 'SET', key: node.bind, value: resultStr });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return React.createElement('div', {
      style: {
        padding: '12px 16px', borderRadius: 'var(--adaptive-radius, 8px)',
        backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
        display: 'flex', alignItems: 'center', gap: '12px',
        fontSize: '13px', color: '#92400E',
      },
    },
      React.createElement('span', null, 'Azure sign-in required to proceed.'),
      React.createElement('button', {
        onClick: async () => {
          setAuthLoading(true);
          setError(null);
          try {
            const auth = await azureLogin();
            dispatch({ type: 'SET', key: '__azureToken', value: auth.accessToken });
            await fetchAndStoreSubscriptions(auth.accessToken, dispatch, state.__azureSubscription as string | undefined);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Azure sign-in failed');
          } finally {
            setAuthLoading(false);
          }
        },
        disabled: authLoading,
        style: {
          padding: '4px 12px', borderRadius: '6px', border: '1px solid #F59E0B',
          backgroundColor: '#FEF3C7', cursor: 'pointer', fontSize: '12px',
          fontWeight: 500, color: '#92400E', whiteSpace: 'nowrap',
          opacity: authLoading ? 0.7 : 1,
        } as React.CSSProperties,
      }, authLoading ? 'Signing in...' : 'Sign in to Azure'),
      error && React.createElement('div', {
        style: { marginTop: '8px', fontSize: '12px', color: '#991b1b' },
      }, error)
    );
  }

  // Waiting for state values to be resolved
  if (hasUnresolvedState) {
    return React.createElement('div', {
      style: {
        padding: '12px 14px', borderRadius: 'var(--adaptive-radius, 8px)',
        backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
        display: 'flex', flexDirection: 'column', gap: '8px',
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: { fontSize: '13px', color: '#92400E', fontWeight: 500 },
      }, 'Waiting for required values...'),
      missingStateKeys.length > 0 && React.createElement('div', {
        style: { fontSize: '12px', color: '#92400E' },
      }, `Missing: ${missingStateKeys.join(', ')}`),
      missingStateKeys.includes('__azureSubscription') && subscriptions.length > 0 &&
        React.createElement('div', { style: { marginTop: '2px' } },
          React.createElement('label', {
            style: { display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#92400E' },
          }, 'Select Azure subscription'),
          React.createElement(SearchableDropdown, {
            options: subscriptions.map((sub) => ({ value: sub.id, label: sub.name })),
            value: (state.__azureSubscription as string) || '',
            onChange: (val: string) => {
              const selectedSub = subscriptions.find((s) => s.id === val);
              if (selectedSub) {
                dispatch({ type: 'SET', key: '__azureSubscription', value: selectedSub.id });
                dispatch({ type: 'SET', key: '__azureSubscriptionName', value: selectedSub.name });
              }
            },
            placeholder: `— Choose from ${subscriptions.length} subscriptions —`,
          })
        )
    );
  }

  // Loading state
  if (loading) {
    return React.createElement(LoadingSpinner, {
      label: node.loadingLabel ?? `Calling ${method} ${resolvedApi.split('?')[0].split('/').slice(-1)[0]}...`,
    });
  }

  // Error state
  if (error) {
    return React.createElement('div', { style: node.style },
      React.createElement(Banner, { message: error, type: 'error' }),
      React.createElement('button', {
        onClick: executeQuery,
        style: {
          marginTop: '8px', padding: '6px 12px', borderRadius: 'var(--adaptive-radius)',
          border: '1px solid var(--adaptive-border)', background: 'var(--adaptive-surface)',
          fontSize: '12px', cursor: 'pointer',
        },
      }, React.createElement('img', { src: iconAzureA, alt: '', width: 12, height: 12 }), 'Retry')
    );
  }

  // Write operations — show confirmation
  if (needsConfirm && !confirmed) {
    return React.createElement('div', {
      style: {
        padding: '14px', borderRadius: 'var(--adaptive-radius)',
        border: '1px solid #fed7aa', backgroundColor: '#fffbeb', ...node.style,
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: { fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#92400e' },
      }, typeof node.confirm === 'string' ? node.confirm : `Confirm ${method} operation`),
      React.createElement('div', {
        style: { fontSize: '12px', color: '#92400e', marginBottom: '8px', fontFamily: 'monospace', wordBreak: 'break-all' as const },
      }, `${method} ${resolvedApi.split('?')[0]}`),
      node.body && React.createElement('details', {
        style: { marginBottom: '12px' },
      },
        React.createElement('summary', {
          style: { fontSize: '11px', color: '#92400e', cursor: 'pointer', marginBottom: '4px' },
        }, 'Show request body'),
        React.createElement('pre', {
          style: {
            fontSize: '10px', color: '#d4d4d4', backgroundColor: '#1e1e1e',
            padding: '8px', borderRadius: '6px', maxHeight: '200px',
            overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' as const,
            wordBreak: 'break-all' as const,
          },
        }, (() => {
          try { return JSON.stringify(JSON.parse(interpolate(node.body!, state as Record<string, string>)), null, 2); }
          catch { return interpolate(node.body!, state as Record<string, string>); }
        })())
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', {
          onClick: () => { setConfirmed(true); executeQuery(); },
          style: {
            padding: '8px 16px', borderRadius: 'var(--adaptive-radius)',
            border: 'none', backgroundColor: 'var(--adaptive-primary)', color: '#fff',
            fontSize: '13px', fontWeight: 500,
          },
        }, React.createElement('img', { src: iconAzureA, alt: '', width: 14, height: 14, style: { filter: 'brightness(0) invert(1)' } }), `Execute ${method}`),
        React.createElement('button', {
          onClick: () => dispatch({ type: 'SET', key: `${node.bind}_cancelled`, value: 'true' }),
          style: {
            padding: '8px 16px', borderRadius: 'var(--adaptive-radius)',
            border: '1px solid var(--adaptive-border)', backgroundColor: 'var(--adaptive-surface)',
            fontSize: '13px',
          },
        }, 'Cancel')
      )
    );
  }

  // Success — show result if requested
  if (result && node.showResult) {
    const isArray = Array.isArray(result);
    const items = isArray ? result : [result];

    // Pick columns from the first item (common ARM fields first, then others)
    const priorityKeys = ['name', 'location', 'type', 'resourceGroup', 'kind', 'sku'];
    const allKeys = items.length > 0
      ? Object.keys(items[0]).filter((k) => {
          const v = items[0][k];
          return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
        })
      : [];
    const orderedKeys = [
      ...priorityKeys.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !priorityKeys.includes(k) && k !== 'id'),
    ].slice(0, 5); // limit to 5 columns

    return React.createElement('div', { style: node.style },
      React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: 'var(--adaptive-radius)',
          backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
          fontSize: '12px', color: '#166534', marginBottom: '8px',
        },
      }, `✓ ${method} completed — ${isArray ? items.length + ' items' : 'success'}`),
      isArray && items.length > 0 && orderedKeys.length > 0
        ? React.createElement('div', {
            style: { overflowX: 'auto', borderRadius: 'var(--adaptive-radius)', border: '1px solid var(--adaptive-border, #e5e7eb)' } as React.CSSProperties,
          },
            React.createElement('table', {
              style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } as React.CSSProperties,
            },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...orderedKeys.map((k) =>
                    React.createElement('th', {
                      key: k,
                      style: {
                        textAlign: 'left', padding: '8px 12px',
                        borderBottom: '2px solid var(--adaptive-border, #e5e7eb)',
                        fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                        color: 'var(--adaptive-text-secondary, #6b7280)',
                        letterSpacing: '0.03em',
                      } as React.CSSProperties,
                    }, k)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...items.map((item: Record<string, unknown>, idx: number) =>
                  React.createElement('tr', { key: idx },
                    ...orderedKeys.map((k) =>
                      React.createElement('td', {
                        key: k,
                        style: {
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--adaptive-border, #e5e7eb)',
                          fontSize: '13px', maxWidth: '250px',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        } as React.CSSProperties,
                      }, String(item[k] ?? ''))
                    )
                  )
                )
              )
            )
          )
        : React.createElement('pre', {
            style: {
              padding: '12px', borderRadius: 'var(--adaptive-radius)',
              backgroundColor: '#111827', color: '#e5e7eb',
              fontSize: '12px', overflow: 'auto', maxHeight: '300px',
              fontFamily: 'var(--adaptive-font-mono)',
            },
          }, JSON.stringify(result, null, 2))
    );
  }

  // Success — silent (data stored in state)
  if (result) {
    return React.createElement('div', {
      style: {
        padding: '8px 12px', borderRadius: 'var(--adaptive-radius)',
        backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
        fontSize: '12px', color: '#166534', ...node.style,
      } as React.CSSProperties,
    }, `✓ ${Array.isArray(result) ? result.length + ' items loaded' : 'Operation completed'}`);
  }

  return null;
}

// ═══════════════════════════════════════
// Azure Picker (fetch API data → searchable dropdown)
// ═══════════════════════════════════════

interface AzurePickerNode extends AdaptiveNodeBase {
  type: 'azurePicker';
  api: string;
  bind: string;
  labelBind?: string;
  label?: string;
  /** JSON path to the array in the response (default: "value") */
  itemsPath?: string;
  /** Key to use as the option label */
  labelKey?: string;
  /** Key to use as the option value */
  valueKey?: string;
  /** Key to filter on */
  filterKey?: string;
  /** Value to filter for */
  filterValue?: string;
  loadingLabel?: string;
}

export function AzurePicker({ node }: AdaptiveComponentProps<AzurePickerNode>) {
  const token = useAzureToken();
  const { state, dispatch, disabled } = useAdaptive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>([]);

  const api = interpolate(node.api, state as Record<string, string>);
  const ARM_BASE_URL = 'https://management.azure.com';

  useEffect(() => {
    if (disabled) return;
    if (!token || !api) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await trackedFetch(`${ARM_BASE_URL}${api}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        const itemsPath = node.itemsPath ?? 'value';
        let items: any[] = data;
        for (const part of itemsPath.split('.')) {
          items = items?.[part as any];
        }
        if (!Array.isArray(items)) items = [];

        // Filter
        if (node.filterKey && node.filterValue) {
          items = items.filter((item: any) => {
            let val = item;
            for (const part of node.filterKey!.split('.')) {
              val = val?.[part];
            }
            return val === node.filterValue;
          });
        }

        const labelKey = node.labelKey ?? 'displayName';
        const valueKey = node.valueKey ?? 'name';

        if (!cancelled) {
          setOptions(items.map((item: any) => ({
            label: String(item[labelKey] ?? item[valueKey] ?? ''),
            value: String(item[valueKey] ?? ''),
          })).sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label)));
          setLoading(false);
        }
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
    return React.createElement(Banner, { message: 'Sign in to Azure first', type: 'warning' });
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
        const selected = options.find((option) => option.value === val);
        dispatch({ type: 'SET', key: node.bind, value: val });
        if (node.labelBind && selected) {
          dispatch({ type: 'SET', key: node.labelBind, value: selected.label });
        }
      },
      placeholder: `— Select (${options.length} available) —`,
    })
  );
}
