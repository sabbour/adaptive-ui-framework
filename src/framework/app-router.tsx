import React, { useState, useEffect } from 'react';
import { getApps, type AppEntry } from './app-registry';

// ─── App Router ───
// Reads the URL hash to select which registered app to render.
// Shows a switcher in the top-left if multiple apps are registered.
// With only one app, renders it directly.

// Restore saved theme preference
try {
  const savedTheme = localStorage.getItem('adaptive-ui-theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
} catch {}

function useHashRoute(): [string, (id: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '');

  useEffect(() => {
    const handler = () => setHash(window.location.hash.slice(1) || '');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (id: string) => {
    window.location.hash = id;
  };

  return [hash, navigate];
}

export function AppRouter() {
  const apps = getApps();
  const [activeId, navigate] = useHashRoute();

  // If no apps registered, show message
  if (apps.length === 0) {
    return React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: '#6b7280', fontSize: '15px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    }, 'No apps registered. Call registerApp() to add one.');
  }

  // Show launcher when no hash is set
  if (!activeId) {
    return React.createElement(AppLauncher, { apps, onSelect: navigate });
  }

  // Resolve active app: hash match → first app
  const active = apps.find((a) => a.id === activeId) ?? apps[0];

  return React.createElement(React.Fragment, null,
    // App switcher (always show so user can go back to launcher)
    React.createElement(AppSwitcher, {
      apps, activeId: active.id, onSelect: navigate,
    }),

    // App container below the fixed top bar
    React.createElement('div', {
      style: { marginTop: '40px', height: 'calc(100vh - 40px)', overflow: 'hidden', position: 'relative' },
    },
      React.createElement(active.component, { key: active.id })
    )
  );
}

// ─── Launcher screen ───
function AppLauncher({
  apps, onSelect,
}: {
  apps: AppEntry[];
  onSelect: (id: string) => void;
}) {
  return React.createElement('div', {
    style: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', backgroundColor: 'var(--adaptive-bg, #f5f5f5)',
    } as React.CSSProperties,
  },
    React.createElement('div', {
      style: { textAlign: 'center', marginBottom: '40px' } as React.CSSProperties,
    },
      React.createElement('h1', {
        style: { fontSize: '28px', fontWeight: 700, color: '#111827', margin: '0 0 8px' },
      }, 'Adaptive UI'),
      React.createElement('p', {
        style: { fontSize: '15px', color: '#6b7280', margin: 0 },
      }, 'Select an app to get started')
    ),
    React.createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: apps.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px', maxWidth: '720px', width: '100%',
      } as React.CSSProperties,
    },
      ...apps.map((app) =>
        React.createElement('button', {
          key: app.id,
          onClick: () => onSelect(app.id),
          style: {
            padding: '24px', borderRadius: '12px',
            border: '1px solid #e5e7eb', backgroundColor: '#fff',
            cursor: 'pointer', textAlign: 'left' as const,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          },
          onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
          },
        },
          React.createElement('div', {
            style: { fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '6px' },
          }, app.name),
          app.description && React.createElement('div', {
            style: { fontSize: '13px', color: '#6b7280', lineHeight: 1.5 },
          }, app.description)
        )
      )
    )
  );
}

// ─── Switcher bar ───
// Always-visible top bar with "← All Apps" and an app switcher dropdown.
function AppSwitcher({
  apps, activeId, onSelect,
}: {
  apps: AppEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = apps.find((a) => a.id === activeId)!;

  return React.createElement('div', {
    style: {
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 12px',
      backgroundColor: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid #e5e7eb',
      height: '40px',
    } as React.CSSProperties,
  },
    // ← All Apps button (always visible)
    React.createElement('button', {
      onClick: () => { window.location.hash = ''; },
      style: {
        padding: '4px 10px', borderRadius: '6px',
        border: '1px solid #e5e7eb', cursor: 'pointer',
        backgroundColor: 'transparent', fontSize: '12px', fontWeight: 500,
        color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px',
        whiteSpace: 'nowrap',
      } as React.CSSProperties,
    }, '← All Apps'),

    // Separator
    React.createElement('span', {
      style: { color: '#d1d5db', fontSize: '14px', userSelect: 'none' } as React.CSSProperties,
    }, '|'),

    // App switcher dropdown
    React.createElement('div', { style: { position: 'relative' } },
      open && React.createElement('div', {
        onClick: () => setOpen(false),
        style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
      }),

      React.createElement('button', {
        onClick: () => setOpen((o) => !o),
        style: {
          padding: '4px 10px', borderRadius: '6px',
          border: '1px solid transparent', cursor: 'pointer',
          backgroundColor: 'transparent', fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '6px',
          color: '#111827',
        },
      },
        active.name,
        React.createElement('span', { style: { fontSize: '10px', color: '#9ca3af' } }, '▼')
      ),

      open && React.createElement('div', {
        style: {
          position: 'absolute', top: '32px', left: '0',
          minWidth: '240px', backgroundColor: '#fff',
          borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #e5e7eb', overflow: 'hidden',
        },
      },
        ...apps.map((app) =>
          React.createElement('button', {
            key: app.id,
            onClick: () => { onSelect(app.id); setOpen(false); },
            style: {
              display: 'block', width: '100%', padding: '10px 14px',
              border: 'none', cursor: 'pointer', textAlign: 'left' as const,
              backgroundColor: app.id === activeId ? '#f0f9ff' : '#fff',
              borderLeft: app.id === activeId ? '3px solid #2563eb' : '3px solid transparent',
            },
          },
            React.createElement('div', {
              style: { fontSize: '13px', fontWeight: 500, color: '#111827' },
            }, app.name),
            app.description && React.createElement('div', {
              style: { fontSize: '11px', color: '#6b7280', marginTop: '2px' },
            }, app.description)
          )
        )
      )
    )
  );
}
