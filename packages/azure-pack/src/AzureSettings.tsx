import React, { useEffect, useState } from 'react';
import { azureLogin, azureLogout, getActiveAccount, type AzureAuthResult } from './auth';

// ─── Azure Settings Section ───
// Injected into the settings panel via ComponentPack.settingsComponent.
// Handles Azure sign-in/sign-out independently of the framework.

export function AzureSettings() {
  const [account, setAccount] = useState<AzureAuthResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getActiveAccount().then(setAccount).catch(() => {});
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await azureLogin();
      setAccount(result);
    } catch (err) {
      console.error('Azure login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await azureLogout();
    setAccount(null);
  };

  return React.createElement('div', null,
    React.createElement('div', {
      style: {
        fontSize: '13px', fontWeight: 600, marginBottom: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      'Azure',
      account && React.createElement('span', {
        style: { fontSize: '11px', color: '#22c55e', fontWeight: 500 },
      }, '● Signed in')
    ),

    account
      ? React.createElement('div', null,
          React.createElement('div', {
            style: { fontSize: '12px', color: '#374151', marginBottom: '4px' },
          },
            React.createElement('span', { style: { fontWeight: 500 } }, account.account.name),
            React.createElement('br'),
            React.createElement('span', { style: { color: '#6b7280' } }, account.account.username)
          ),
          React.createElement('button', {
            onClick: handleLogout,
            style: {
              width: '100%', padding: '6px', borderRadius: '6px', marginTop: '6px',
              border: '1px solid #fecaca', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626',
            },
          }, 'Sign out of Azure')
        )
      : React.createElement('div', null,
          React.createElement('button', {
            onClick: handleLogin,
            disabled: loading,
            style: {
              width: '100%', padding: '8px', borderRadius: '6px',
              border: 'none', fontSize: '13px', fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer',
              backgroundColor: '#0078d4', color: '#fff',
              opacity: loading ? 0.7 : 1,
            },
          }, loading ? 'Signing in...' : 'Sign in with Microsoft'),
          React.createElement('p', {
            style: { fontSize: '11px', color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.4 },
          }, 'Enables Azure resource forms and ARM introspection.')
        )
  );
}
