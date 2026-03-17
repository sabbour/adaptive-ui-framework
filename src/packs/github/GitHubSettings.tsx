import React, { useState, useEffect } from 'react';
import {
  getStoredToken, getStoredUser, getStoredClientId, getStoredCorsProxy,
  storeClientId, storeCorsProxy, requestDeviceCode,
  pollForToken, logout,
} from './auth';

// Re-export for components
export { getStoredToken as getStoredGitHubToken } from './auth';

// ─── GitHub Settings Section ───
// OAuth Device Flow authentication

export function GitHubSettings() {
  const [user, setUser] = useState(getStoredUser());
  const [clientId, setClientId] = useState(getStoredClientId());
  const [corsProxy, setCorsProxy] = useState(getStoredCorsProxy());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const [polling, setPolling] = useState(false);

  const isConnected = !!user && !!getStoredToken();

  useEffect(() => {
    storeClientId(clientId);
  }, [clientId]);

  useEffect(() => {
    storeCorsProxy(corsProxy);
  }, [corsProxy]);

  const handleOAuth = async () => {
    if (!clientId.trim()) {
      setError('Enter a GitHub OAuth App Client ID first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const code = await requestDeviceCode(clientId.trim());
      setDeviceCode({ user_code: code.user_code, verification_uri: code.verification_uri });
      setPolling(true);
      window.open(code.verification_uri, '_blank', 'noopener,noreferrer');
      const login = await pollForToken(clientId.trim(), code.device_code);
      setUser(login);
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

  const handleDisconnect = () => {
    logout();
    setUser(null);
    setDeviceCode(null);
    setPolling(false);
  };

  if (isConnected) {
    return React.createElement('div', null,
      React.createElement('div', {
        style: {
          fontSize: '13px', fontWeight: 600, marginBottom: '8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        },
      },
        'GitHub',
        React.createElement('span', {
          style: { fontSize: '11px', color: '#22c55e', fontWeight: 500 },
        }, '\u25CF Connected')
      ),
      React.createElement('div', {
        style: { fontSize: '12px', color: '#374151', marginBottom: '4px' },
      }, React.createElement('span', { style: { fontWeight: 500 } }, user)),
      React.createElement('button', {
        onClick: handleDisconnect,
        style: {
          width: '100%', padding: '6px', borderRadius: '6px', marginTop: '6px',
          border: '1px solid #fecaca', fontSize: '12px', fontWeight: 500,
          cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626',
        },
      }, 'Disconnect')
    );
  }

  return React.createElement('div', null,
    React.createElement('div', {
      style: { fontSize: '13px', fontWeight: 600, marginBottom: '8px' },
    }, 'GitHub'),

    // Client ID (pre-filled with default)
    React.createElement('label', {
      style: { display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '2px', color: '#374151' },
    }, 'OAuth App Client ID'),
    React.createElement('input', {
      type: 'text',
      value: clientId,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setClientId(e.target.value),
      placeholder: 'Ov23li...',
      style: { marginBottom: '8px', fontSize: '12px' },
    }),

    // Device code display
    deviceCode && React.createElement('div', {
      style: {
        padding: '10px', borderRadius: '6px', marginBottom: '8px',
        backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
        textAlign: 'center' as const,
      },
    },
      React.createElement('div', {
        style: { fontSize: '11px', color: '#1e40af', marginBottom: '4px' },
      }, 'Enter this code at github.com/login/device:'),
      React.createElement('div', {
        style: { fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color: '#1e3a8a', letterSpacing: '2px' },
      }, deviceCode.user_code),
      polling && React.createElement('div', {
        style: { fontSize: '10px', color: '#6b7280', marginTop: '6px' },
      }, 'Waiting for authorization...')
    ),

    // Sign in button
    !deviceCode && React.createElement('button', {
      onClick: handleOAuth,
      disabled: !clientId.trim() || loading,
      style: {
        width: '100%', padding: '6px', borderRadius: '6px',
        border: 'none', fontSize: '12px', fontWeight: 500,
        cursor: clientId.trim() && !loading ? 'pointer' : 'default',
        backgroundColor: '#24292e', color: '#fff',
        opacity: clientId.trim() && !loading ? 1 : 0.5,
      },
    }, loading ? 'Authorizing...' : 'Sign in with GitHub'),

    error && React.createElement('div', {
      style: { fontSize: '11px', color: '#dc2626', marginTop: '6px' },
    }, error)
  );
}
