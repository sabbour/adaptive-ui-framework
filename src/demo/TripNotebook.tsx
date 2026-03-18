// ─── Trip Notebook Panel ───
// Right-side panel for the Travel Concierge that acts as a living trip notebook.
// Shows: interactive map of destinations, pinned places, budget summary, saved photos.
// Auto-populated from artifacts extracted during conversation.

import React, { useSyncExternalStore, useState, useCallback, useMemo } from 'react';
import { getArtifacts, subscribeArtifacts, removeArtifact, downloadArtifact } from '../framework/artifacts';
import type { Artifact } from '../framework/artifacts';
import { getStoredApiKey } from '../packs/google-maps/GoogleMapsSettings';

// Icons
import iconDelete from '../framework/icons/fluent/delete.svg?url';
import iconArrowDownload from '../framework/icons/fluent/arrow-download.svg?url';

// ─── Artifact categorization ───

interface TripPlace {
  name: string;
  type: 'destination' | 'hotel' | 'restaurant' | 'attraction';
  query: string; // Google Maps query
}

interface BudgetItem {
  category: string;
  amount: number;
  currency: string;
  note?: string;
}

function categorizeArtifacts(artifacts: Artifact[]) {
  const places: Array<Artifact & { place: TripPlace }> = [];
  const budgetItems: Array<Artifact & { budget: BudgetItem }> = [];
  const photos: Artifact[] = [];
  const itineraryFiles: Artifact[] = [];

  for (const a of artifacts) {
    if (a.filename.startsWith('place-')) {
      try {
        const place = JSON.parse(a.content) as TripPlace;
        places.push({ ...a, place });
      } catch { /* skip corrupt */ }
    } else if (a.filename.startsWith('budget-')) {
      try {
        const budget = JSON.parse(a.content) as BudgetItem;
        budgetItems.push({ ...a, budget });
      } catch { /* skip corrupt */ }
    } else if (a.filename.startsWith('photo-')) {
      photos.push(a);
    } else {
      itineraryFiles.push(a);
    }
  }

  return { places, budgetItems, photos, itineraryFiles };
}

// ─── Map Section ───

function NotebookMap({ places }: { places: Array<{ place: TripPlace }> }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    return React.createElement('div', {
      style: {
        padding: '16px', textAlign: 'center' as const,
        color: 'var(--adaptive-text-secondary, #6b7280)',
        fontSize: '13px',
      },
    }, 'Configure Google Maps API key in settings to see the trip map.');
  }

  // Build a map showing all destination pins
  const queries = places.map(p => p.place.query);
  if (queries.length === 0) {
    return React.createElement('div', {
      style: {
        height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(8, 145, 178, 0.04)', borderRadius: '12px',
        color: 'var(--adaptive-text-secondary, #6b7280)', fontSize: '13px',
        border: '1px dashed rgba(8, 145, 178, 0.2)',
      },
    }, 'Your trip map will appear here as you plan destinations.');
  }

  // Use Places mode for single destination, search for multiple
  const src = queries.length === 1
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(queries[0])}`
    : `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(queries.join('|'))}`;

  return React.createElement('iframe', {
    src,
    style: {
      width: '100%', height: '200px', border: 'none', borderRadius: '12px',
    },
    loading: 'lazy' as const,
    allowFullScreen: true,
    referrerPolicy: 'no-referrer-when-downgrade' as const,
  });
}

// ─── Places Section ───

function PlacesSection({ places, onRemove }: {
  places: Array<Artifact & { place: TripPlace }>;
  onRemove: (id: string) => void;
}) {
  if (places.length === 0) return null;

  const typeEmoji: Record<string, string> = {
    destination: '\uD83C\uDF0D',
    hotel: '\uD83C\uDFE8',
    restaurant: '\uD83C\uDF7D\uFE0F',
    attraction: '\u2B50',
  };

  return React.createElement('div', { style: { marginBottom: '16px' } },
    React.createElement('div', {
      style: { fontSize: '12px', fontWeight: 600, color: 'var(--adaptive-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
    }, '\uD83D\uDCCD Saved Places'),
    ...places.map(p =>
      React.createElement('div', {
        key: p.id,
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: '8px', marginBottom: '4px',
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          fontSize: '13px',
        },
      },
        React.createElement('span', null, typeEmoji[p.place.type] || '\uD83D\uDCCC'),
        React.createElement('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } }, p.place.name),
        React.createElement('button', {
          onClick: () => onRemove(p.id),
          style: {
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
            opacity: 0.4, flexShrink: 0,
          },
          title: 'Remove',
        }, React.createElement('img', { src: iconDelete, alt: 'Remove', width: 12, height: 12 }))
      )
    )
  );
}

// ─── Budget Section ───

function BudgetSection({ items, onRemove }: {
  items: Array<Artifact & { budget: BudgetItem }>;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('div', {
        style: { fontSize: '12px', fontWeight: 600, color: 'var(--adaptive-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
      }, '\uD83D\uDCB0 Trip Budget'),
      React.createElement('div', {
        style: {
          padding: '12px', borderRadius: '8px', textAlign: 'center' as const,
          backgroundColor: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(148,163,184,0.2)',
          color: 'var(--adaptive-text-secondary)', fontSize: '12px',
        },
      }, 'Budget items will appear as the plan takes shape.')
    );
  }

  const total = items.reduce((sum, i) => sum + i.budget.amount, 0);
  const currency = items[0]?.budget.currency || 'USD';

  const categoryEmoji: Record<string, string> = {
    flights: '\u2708\uFE0F',
    hotel: '\uD83C\uDFE8',
    food: '\uD83C\uDF7D\uFE0F',
    activities: '\uD83C\uDFAF',
    transport: '\uD83D\uDE95',
    shopping: '\uD83D\uDECD\uFE0F',
    other: '\uD83D\uDCE6',
  };

  return React.createElement('div', { style: { marginBottom: '16px' } },
    React.createElement('div', {
      style: { fontSize: '12px', fontWeight: 600, color: 'var(--adaptive-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      '\uD83D\uDCB0 Trip Budget',
      React.createElement('span', {
        style: { fontSize: '14px', fontWeight: 700, color: 'var(--adaptive-text, #111827)', textTransform: 'none' as const, letterSpacing: 'normal' },
      }, `${currency} ${total.toLocaleString()}`)
    ),
    ...items.map(i =>
      React.createElement('div', {
        key: i.id,
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: '8px', marginBottom: '4px',
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(148,163,184,0.15)',
          fontSize: '13px',
        },
      },
        React.createElement('span', null, categoryEmoji[i.budget.category] || '\uD83D\uDCE6'),
        React.createElement('span', { style: { flex: 1, minWidth: 0 } }, i.budget.note || i.budget.category),
        React.createElement('span', { style: { fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 } }, `${i.budget.amount.toLocaleString()}`),
        React.createElement('button', {
          onClick: () => onRemove(i.id),
          style: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px', opacity: 0.4, flexShrink: 0 },
          title: 'Remove',
        }, React.createElement('img', { src: iconDelete, alt: 'Remove', width: 12, height: 12 }))
      )
    ),
    // Category breakdown bar
    React.createElement('div', {
      style: { display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginTop: '8px', gap: '2px' },
    },
      ...(() => {
        const categories = new Map<string, number>();
        for (const i of items) {
          categories.set(i.budget.category, (categories.get(i.budget.category) || 0) + i.budget.amount);
        }
        const colors: Record<string, string> = {
          flights: '#0891b2', hotel: '#8b5cf6', food: '#f97066',
          activities: '#f59e0b', transport: '#059669', shopping: '#ec4899', other: '#6b7280',
        };
        return Array.from(categories.entries()).map(([cat, amt]) =>
          React.createElement('div', {
            key: cat,
            title: `${cat}: ${amt.toLocaleString()}`,
            style: {
              flex: amt, backgroundColor: colors[cat] || '#6b7280', borderRadius: '3px',
              minWidth: '4px',
            },
          })
        );
      })()
    )
  );
}

// ─── Itinerary Files Section ───

function ItinerarySection({ files }: { files: Artifact[] }) {
  if (files.length === 0) return null;

  return React.createElement('div', { style: { marginBottom: '16px' } },
    React.createElement('div', {
      style: { fontSize: '12px', fontWeight: 600, color: 'var(--adaptive-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
    }, '\uD83D\uDCC4 Trip Files'),
    ...files.map(f =>
      React.createElement('div', {
        key: f.id,
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: '8px', marginBottom: '4px',
          backgroundColor: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(148,163,184,0.15)',
          fontSize: '13px', cursor: 'pointer',
        },
        onClick: () => downloadArtifact(f),
      },
        React.createElement('span', null, '\uD83D\uDCC3'),
        React.createElement('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } }, f.label || f.filename),
        React.createElement('img', {
          src: iconArrowDownload, alt: 'Download', width: 12, height: 12,
          style: { opacity: 0.4, flexShrink: 0 },
        })
      )
    )
  );
}

// ─── Main TripNotebook Component ───

interface TripNotebookProps {
  collapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export function TripNotebook({ collapsed, onToggleCollapse }: TripNotebookProps) {
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const { places, budgetItems, photos, itineraryFiles } = useMemo(() => categorizeArtifacts(artifacts), [artifacts]);

  const handleRemove = useCallback((id: string) => {
    removeArtifact(id);
  }, []);

  if (collapsed) {
    return React.createElement('div', {
      style: {
        width: '36px', flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '12px', gap: '8px',
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderLeft: '1px solid rgba(148,163,184,0.15)',
      } as React.CSSProperties,
    },
      React.createElement('button', {
        onClick: () => onToggleCollapse?.(false),
        title: 'Expand notebook',
        style: {
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '16px', padding: '4px', lineHeight: 1,
        },
      }, '\uD83D\uDCD3'),
      artifacts.length > 0 && React.createElement('span', {
        style: {
          fontSize: '10px', fontWeight: 600, color: '#0891b2',
          backgroundColor: 'rgba(8,145,178,0.1)', borderRadius: '8px',
          padding: '1px 5px',
        },
      }, String(artifacts.length))
    );
  }

  return React.createElement('div', {
    className: 'travel-notebook-panel',
    style: {
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(16px)',
    } as React.CSSProperties,
  },
    // Header
    React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid rgba(148,163,184,0.15)',
        flexShrink: 0,
      },
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px' },
      },
        React.createElement('span', { style: { fontSize: '16px' } }, '\uD83D\uDCD3'),
        React.createElement('span', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--adaptive-text)' } }, 'Trip Notebook')
      ),
      React.createElement('button', {
        onClick: () => onToggleCollapse?.(true),
        title: 'Collapse notebook',
        style: {
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '14px', color: 'var(--adaptive-text-secondary)',
          padding: '2px 6px',
        },
      }, '\u2715')
    ),

    // Scrollable content
    React.createElement('div', {
      style: {
        flex: 1, minHeight: 0, overflowY: 'auto' as const,
        padding: '12px 14px',
      } as React.CSSProperties,
    },
      // Map
      React.createElement(NotebookMap, { places }),

      // Spacer after map
      React.createElement('div', { style: { height: '12px' } }),

      // Places
      React.createElement(PlacesSection, { places, onRemove: handleRemove }),

      // Budget
      React.createElement(BudgetSection, { items: budgetItems, onRemove: handleRemove }),

      // Itinerary files
      React.createElement(ItinerarySection, { files: itineraryFiles }),

      // Empty state if nothing yet
      artifacts.length === 0 && React.createElement('div', {
        style: {
          textAlign: 'center' as const, padding: '20px 12px',
          color: 'var(--adaptive-text-secondary)', fontSize: '13px',
          lineHeight: 1.5,
        },
      },
        React.createElement('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '\u2708\uFE0F'),
        'Start chatting with the concierge and your trip details will appear here — destinations, budget, places, and itinerary files.'
      )
    )
  );
}

// Placeholder when notebook is completely empty
export function TripNotebookPlaceholder() {
  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--adaptive-text-secondary)',
      fontSize: '14px', textAlign: 'center' as const, padding: '24px',
    } as React.CSSProperties,
  },
    React.createElement('div', { style: { fontSize: '40px', marginBottom: '12px' } }, '\uD83D\uDCD3'),
    React.createElement('div', { style: { fontWeight: 500, marginBottom: '4px' } }, 'Trip Notebook'),
    React.createElement('div', { style: { fontSize: '13px', lineHeight: 1.5 } }, 'Your destinations, budget, places, and itinerary files will collect here as you plan.')
  );
}
