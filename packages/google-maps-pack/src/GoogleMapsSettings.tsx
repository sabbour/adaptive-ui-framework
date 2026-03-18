import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'adaptive_google_maps_api_key';

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function storeApiKey(key: string): void {
  if (key) {
    localStorage.setItem(STORAGE_KEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function GoogleMapsSettings() {
  const [apiKey, setApiKey] = useState(getStoredApiKey());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [apiKey]);

  const handleSave = () => {
    storeApiKey(apiKey);
    setSaved(true);
  };

  const isConfigured = !!getStoredApiKey();

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '8px' } as React.CSSProperties,
  },
    // Status
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px' },
    },
      React.createElement('div', {
        style: {
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: isConfigured ? '#22c55e' : '#ef4444',
        },
      }),
      React.createElement('span', {
        style: { fontSize: '13px', color: isConfigured ? '#166534' : '#991b1b' },
      }, isConfigured ? 'API key configured' : 'No API key')
    ),

    // API key input
    React.createElement('div', {
      style: { display: 'flex', gap: '6px', alignItems: 'center' },
    },
      React.createElement('input', {
        type: 'password',
        placeholder: 'Google Maps API key',
        value: apiKey,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value),
        style: {
          flex: 1, padding: '6px 10px', borderRadius: '6px',
          border: '1px solid #374151', backgroundColor: '#1f2937',
          color: '#e5e7eb', fontSize: '13px',
        },
      }),
      React.createElement('button', {
        onClick: handleSave,
        style: {
          padding: '6px 12px', borderRadius: '6px', border: 'none',
          backgroundColor: '#2563eb', color: '#fff', fontSize: '12px',
          cursor: 'pointer', fontWeight: 500,
        },
      }, saved ? '✓ Saved' : 'Save')
    ),

    React.createElement('div', {
      style: { fontSize: '11px', color: '#6b7280' },
    }, 'Get an API key from the Google Cloud Console with Maps Embed API and Places API enabled.')
  );
}
