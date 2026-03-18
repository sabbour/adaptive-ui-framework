import React, { useState, useEffect } from 'react';

const CORS_PROXY_KEY = 'adaptive_google_flights_cors_proxy';

/** Detect if we're running under the Vite dev server (built-in proxy available) */
function isDevMode(): boolean {
  try { return import.meta.env?.DEV === true; } catch { return false; }
}

/** Dev-mode proxy path (matches vite.config.ts) */
const DEV_PROXY_PREFIX = '/gflights-proxy/';

export function getStoredCorsProxy(): string {
  // In dev mode, use the built-in Vite proxy automatically
  if (isDevMode()) {
    return DEV_PROXY_PREFIX;
  }
  return localStorage.getItem(CORS_PROXY_KEY) ?? '';
}

export function storeCorsProxy(proxy: string): void {
  if (proxy) {
    localStorage.setItem(CORS_PROXY_KEY, proxy);
  } else {
    localStorage.removeItem(CORS_PROXY_KEY);
  }
}

export function GoogleFlightsSettings() {
  const devMode = isDevMode();
  const [corsProxy, setCorsProxy] = useState(devMode ? '' : (localStorage.getItem(CORS_PROXY_KEY) ?? ''));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [corsProxy]);

  const handleSave = () => {
    storeCorsProxy(corsProxy);
    setSaved(true);
  };

  const isConfigured = devMode || !!localStorage.getItem(CORS_PROXY_KEY);

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
          backgroundColor: isConfigured ? '#22c55e' : '#f59e0b',
        },
      }),
      React.createElement('span', {
        style: { fontSize: '13px', color: isConfigured ? '#166534' : '#92400e' },
      }, devMode
        ? 'Using built-in dev proxy'
        : isConfigured ? 'CORS proxy configured' : 'No CORS proxy (link-only mode)')
    ),

    // CORS proxy input (hidden in dev mode — not needed)
    !devMode && React.createElement('div', {
      style: { display: 'flex', gap: '6px', alignItems: 'center' },
    },
      React.createElement('input', {
        type: 'text',
        placeholder: 'https://your-cors-proxy.example.com/',
        value: corsProxy,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCorsProxy(e.target.value),
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
      }, saved ? '\u2713 Saved' : 'Save')
    ),

    React.createElement('div', {
      style: { fontSize: '11px', color: '#6b7280' },
    }, devMode
      ? 'Live flight search uses the Vite dev proxy automatically.'
      : 'Optional: A CORS proxy enables live flight search. Without it, flights will open in a new Google Flights tab.')
  );
}
