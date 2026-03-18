// ─── Trip Notebook Panel ───
// Right-side panel for the Travel Notebook that acts as a living trip scrapbook.
// Tabbed interface: Overview | Travel | Budget | Packing
// Auto-populated from artifacts extracted during conversation.

import React, { useSyncExternalStore, useState, useCallback, useMemo } from 'react';
import { getArtifacts, subscribeArtifacts, removeArtifact, downloadArtifact } from '../framework/artifacts';
import type { Artifact } from '../framework/artifacts';
import { getStoredApiKey } from '../packs/google-maps/GoogleMapsSettings';

// Icons
import iconDelete from '../framework/icons/fluent/delete.svg?url';
import iconArrowDownload from '../framework/icons/fluent/arrow-download.svg?url';

// ─── Data interfaces ───

interface TripPlace { name: string; type: 'destination' | 'hotel' | 'restaurant' | 'attraction'; query: string; }
interface BudgetItem { category: string; amount: number; currency: string; note?: string; }
interface FlightInfo { from: string; to: string; date: string; returnDate?: string; trip?: string; seat?: string; adults?: number; }
interface WeatherInfo { city: string; }
interface ChecklistInfo { title: string; items: string[]; bind: string; }
interface PhotoInfo { query: string; caption?: string; }

// ─── Artifact categorization ───

interface CategorizedArtifacts {
  places: Array<Artifact & { data: TripPlace }>;
  budgetItems: Array<Artifact & { data: BudgetItem }>;
  flights: Array<Artifact & { data: FlightInfo }>;
  weather: Array<Artifact & { data: WeatherInfo }>;
  checklists: Array<Artifact & { data: ChecklistInfo }>;
  photos: Array<Artifact & { data: PhotoInfo }>;
  files: Artifact[];
}

function categorizeArtifacts(artifacts: Artifact[]): CategorizedArtifacts {
  const result: CategorizedArtifacts = { places: [], budgetItems: [], flights: [], weather: [], checklists: [], photos: [], files: [] };
  for (const a of artifacts) {
    try {
      if (a.filename.startsWith('place-')) { result.places.push({ ...a, data: JSON.parse(a.content) }); }
      else if (a.filename.startsWith('budget-')) { result.budgetItems.push({ ...a, data: JSON.parse(a.content) }); }
      else if (a.filename.startsWith('flight-')) { result.flights.push({ ...a, data: JSON.parse(a.content) }); }
      else if (a.filename.startsWith('weather-')) { result.weather.push({ ...a, data: JSON.parse(a.content) }); }
      else if (a.filename.startsWith('checklist-')) { result.checklists.push({ ...a, data: JSON.parse(a.content) }); }
      else if (a.filename.startsWith('photo-')) { result.photos.push({ ...a, data: JSON.parse(a.content) }); }
      else { result.files.push(a); }
    } catch { result.files.push(a); }
  }
  return result;
}

// ─── Tab definitions ───

type TabId = 'overview' | 'travel' | 'budget' | 'packing';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '\uD83C\uDF0D' },
  { id: 'travel', label: 'Travel', icon: '\u2708\uFE0F' },
  { id: 'budget', label: 'Budget', icon: '\uD83D\uDCB0' },
  { id: 'packing', label: 'Packing', icon: '\uD83E\uDDF3' },
];

// ─── Shared components ───

function ItemRow({ icon, label, detail, onRemove }: { icon: string; label: string; detail?: string; onRemove?: () => void }) {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 10px', borderRadius: '8px', marginBottom: '4px',
      backgroundColor: 'rgba(255,255,255,0.7)',
      border: '1px solid rgba(148,163,184,0.15)',
      fontSize: '13px',
    },
  },
    React.createElement('span', { style: { flexShrink: 0 } }, icon),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', {
        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
      }, label),
      detail && React.createElement('div', {
        style: { fontSize: '11px', color: 'var(--adaptive-text-secondary, #6b7280)', marginTop: '1px' },
      }, detail)
    ),
    onRemove && React.createElement('button', {
      onClick: onRemove,
      style: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px', opacity: 0.4, flexShrink: 0 },
      title: 'Remove',
    }, React.createElement('img', { src: iconDelete, alt: 'Remove', width: 12, height: 12 }))
  );
}

function SectionHeader({ children }: { children: string }) {
  return React.createElement('div', {
    style: {
      fontSize: '11px', fontWeight: 600, color: 'var(--adaptive-text-secondary)',
      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
      marginBottom: '6px', marginTop: '12px',
    },
  }, children);
}

function EmptyHint({ text }: { text: string }) {
  return React.createElement('div', {
    style: {
      padding: '16px 12px', borderRadius: '8px', textAlign: 'center' as const,
      backgroundColor: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(148,163,184,0.2)',
      color: 'var(--adaptive-text-secondary)', fontSize: '12px', lineHeight: 1.5,
    },
  }, text);
}

// ─── Overview Tab ───

function OverviewTab({ data, onRemove }: { data: CategorizedArtifacts; onRemove: (id: string) => void }) {
  const apiKey = getStoredApiKey();
  const hasAnything = data.places.length > 0 || data.flights.length > 0 || data.weather.length > 0 || data.photos.length > 0;

  return React.createElement('div', null,
    // Map
    apiKey && data.places.length > 0 && React.createElement('iframe', {
      src: data.places.length === 1
        ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(data.places[0].data.query)}`
        : `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(data.places.map(p => p.data.query).join('|'))}`,
      style: { width: '100%', height: '180px', border: 'none', borderRadius: '10px', marginBottom: '12px' },
      loading: 'lazy' as const,
      allowFullScreen: true,
      referrerPolicy: 'no-referrer-when-downgrade' as const,
    }),

    !apiKey && data.places.length > 0 && React.createElement('div', {
      style: { padding: '12px', textAlign: 'center' as const, color: 'var(--adaptive-text-secondary)', fontSize: '12px', marginBottom: '8px' },
    }, 'Add Google Maps API key in settings to see the map.'),

    // Destinations
    data.places.length > 0 && React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83D\uDCCD Destinations'),
      ...data.places.map(p => React.createElement(ItemRow, {
        key: p.id,
        icon: p.data.type === 'destination' ? '\uD83C\uDF0D' : p.data.type === 'hotel' ? '\uD83C\uDFE8' : p.data.type === 'restaurant' ? '\uD83C\uDF7D\uFE0F' : '\u2B50',
        label: p.data.name,
        onRemove: () => onRemove(p.id),
      }))
    ),

    // Weather
    data.weather.length > 0 && React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83C\uDF24\uFE0F Weather'),
      ...data.weather.map(w => React.createElement(ItemRow, {
        key: w.id,
        icon: '\u2600\uFE0F',
        label: w.data.city,
        detail: 'Weather tracked',
        onRemove: () => onRemove(w.id),
      }))
    ),

    // Photos (compact tags)
    data.photos.length > 0 && React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83D\uDCF7 Places'),
      React.createElement('div', {
        style: { display: 'flex', flexWrap: 'wrap' as const, gap: '4px' },
      },
        ...data.photos.map(p => React.createElement('div', {
          key: p.id,
          title: p.data.caption || p.data.query,
          style: {
            padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
            backgroundColor: 'rgba(8,145,178,0.08)', color: '#0891b2',
            border: '1px solid rgba(8,145,178,0.15)',
          },
        }, p.data.caption || p.data.query))
      )
    ),

    // Files
    data.files.length > 0 && React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83D\uDCC4 Trip Files'),
      ...data.files.map(f => React.createElement('div', {
        key: f.id,
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: '8px', marginBottom: '4px',
          backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(148,163,184,0.15)',
          fontSize: '13px', cursor: 'pointer',
        },
        onClick: () => downloadArtifact(f),
      },
        React.createElement('span', null, '\uD83D\uDCC3'),
        React.createElement('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } }, f.label || f.filename),
        React.createElement('img', { src: iconArrowDownload, alt: 'Download', width: 12, height: 12, style: { opacity: 0.4, flexShrink: 0 } })
      ))
    ),

    // Empty state
    !hasAnything && data.files.length === 0 && React.createElement('div', {
      style: { textAlign: 'center' as const, padding: '24px 12px', color: 'var(--adaptive-text-secondary)', fontSize: '13px', lineHeight: 1.6 },
    },
      React.createElement('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '\u2708\uFE0F'),
      'Start chatting and your trip details will appear here \u2014 destinations, weather, photos, and itinerary files.'
    )
  );
}

// ─── Travel Tab (Flights & Hotels) ───

function TravelTab({ data, onRemove }: { data: CategorizedArtifacts; onRemove: (id: string) => void }) {
  const flights = data.flights;
  const hotels = data.places.filter(p => p.data.type === 'hotel');

  return React.createElement('div', null,
    // Flights
    React.createElement(SectionHeader, null, '\u2708\uFE0F Flights'),
    flights.length === 0
      ? React.createElement(EmptyHint, { text: 'Flights will appear when the assistant suggests them.' })
      : flights.map(f => {
          const trip = f.data.returnDate ? 'Round trip' : 'One way';
          const seat = f.data.seat ? f.data.seat.split('-').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' ') : '';
          const pax = f.data.adults && f.data.adults > 1 ? `${f.data.adults} pax` : '';
          const detail = [trip, seat, pax].filter(Boolean).join(' \u00B7 ');
          return React.createElement(ItemRow, {
            key: f.id,
            icon: '\u2708\uFE0F',
            label: `${f.data.from} \u2192 ${f.data.to}`,
            detail: `${f.data.date}${f.data.returnDate ? ' \u2192 ' + f.data.returnDate : ''}${detail ? ' \u00B7 ' + detail : ''}`,
            onRemove: () => onRemove(f.id),
          });
        }),

    // Hotels
    React.createElement(SectionHeader, null, '\uD83C\uDFE8 Hotels'),
    hotels.length === 0
      ? React.createElement(EmptyHint, { text: 'Hotels will appear when you pick accommodations.' })
      : hotels.map(h => React.createElement(ItemRow, {
          key: h.id,
          icon: '\uD83C\uDFE8',
          label: h.data.name,
          onRemove: () => onRemove(h.id),
        }))
  );
}

// ─── Budget Tab ───

function BudgetTab({ data, onRemove }: { data: CategorizedArtifacts; onRemove: (id: string) => void }) {
  const items = data.budgetItems;

  if (items.length === 0) {
    return React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83D\uDCB0 Trip Budget'),
      React.createElement(EmptyHint, { text: 'Budget items will appear when the assistant provides cost estimates.' })
    );
  }

  const total = items.reduce((sum, i) => sum + i.data.amount, 0);
  const currency = items[0]?.data.currency || 'USD';

  const categoryEmoji: Record<string, string> = {
    flights: '\u2708\uFE0F', hotel: '\uD83C\uDFE8', accommodation: '\uD83C\uDFE8',
    food: '\uD83C\uDF7D\uFE0F', dining: '\uD83C\uDF7D\uFE0F',
    activities: '\uD83C\uDFAF', transport: '\uD83D\uDE95',
    shopping: '\uD83D\uDECD\uFE0F', insurance: '\uD83D\uDEE1\uFE0F',
    other: '\uD83D\uDCE6',
  };

  const categoryColors: Record<string, string> = {
    flights: '#0891b2', hotel: '#8b5cf6', accommodation: '#8b5cf6',
    food: '#f97066', dining: '#f97066', activities: '#f59e0b',
    transport: '#059669', shopping: '#ec4899', insurance: '#6366f1', other: '#6b7280',
  };

  return React.createElement('div', null,
    // Total header
    React.createElement('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '12px 0 8px', marginBottom: '4px',
      },
    },
      React.createElement('span', {
        style: { fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text-secondary)' },
      }, 'ESTIMATED TOTAL'),
      React.createElement('span', {
        style: { fontSize: '20px', fontWeight: 700, color: '#0891b2' },
      }, `${currency} ${total.toLocaleString()}`)
    ),

    // Category bar
    React.createElement('div', {
      style: { display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px', gap: '2px' },
    },
      ...(() => {
        const cats = new Map<string, number>();
        for (const i of items) cats.set(i.data.category, (cats.get(i.data.category) || 0) + i.data.amount);
        return Array.from(cats.entries()).map(([cat, amt]) =>
          React.createElement('div', {
            key: cat, title: `${cat}: ${amt.toLocaleString()}`,
            style: { flex: amt, backgroundColor: categoryColors[cat.toLowerCase()] || '#6b7280', borderRadius: '3px', minWidth: '4px' },
          })
        );
      })()
    ),

    // Line items
    ...items.map(i => {
      const pct = total > 0 ? Math.round((i.data.amount / total) * 100) : 0;
      return React.createElement(ItemRow, {
        key: i.id,
        icon: categoryEmoji[i.data.category.toLowerCase()] || '\uD83D\uDCE6',
        label: i.data.note || i.data.category,
        detail: `${currency} ${i.data.amount.toLocaleString()} (${pct}%)`,
        onRemove: () => onRemove(i.id),
      });
    })
  );
}

// ─── Packing Tab ───

function PackingTab({ data, onRemove }: { data: CategorizedArtifacts; onRemove: (id: string) => void }) {
  const checklists = data.checklists;

  if (checklists.length === 0) {
    return React.createElement('div', null,
      React.createElement(SectionHeader, null, '\uD83E\uDDF3 Packing & Prep'),
      React.createElement(EmptyHint, { text: 'Packing lists and travel checklists will appear at the planning stage.' })
    );
  }

  return React.createElement('div', null,
    ...checklists.map(cl => React.createElement('div', { key: cl.id, style: { marginBottom: '16px' } },
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '6px',
        },
      },
        React.createElement('span', {
          style: { fontSize: '13px', fontWeight: 600, color: 'var(--adaptive-text)' },
        }, `\uD83E\uDDF3 ${cl.data.title}`),
        React.createElement('span', {
          style: { fontSize: '11px', color: 'var(--adaptive-text-secondary)' },
        }, `${cl.data.items.length} items`)
      ),
      ...cl.data.items.map((item, i) => React.createElement('div', {
        key: `${cl.id}-${i}`,
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '5px 10px', borderRadius: '6px', marginBottom: '2px',
          backgroundColor: 'rgba(255,255,255,0.6)',
          fontSize: '13px', color: 'var(--adaptive-text)',
        },
      },
        React.createElement('span', {
          style: {
            width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
            border: '1.5px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
        }),
        item
      )),
      React.createElement('button', {
        onClick: () => onRemove(cl.id),
        style: {
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          fontSize: '11px', color: 'var(--adaptive-text-secondary)', opacity: 0.6,
          marginTop: '4px',
        },
      }, 'Remove list')
    ))
  );
}

// ─── Tab badge counts ───

function tabBadge(id: TabId, data: CategorizedArtifacts): number {
  switch (id) {
    case 'overview': return data.places.length + data.photos.length + data.weather.length + data.files.length;
    case 'travel': return data.flights.length + data.places.filter(p => p.data.type === 'hotel').length;
    case 'budget': return data.budgetItems.length;
    case 'packing': return data.checklists.reduce((sum, cl) => sum + cl.data.items.length, 0);
  }
}

// ─── Main TripNotebook Component ───

interface TripNotebookProps {
  collapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export function TripNotebook({ collapsed, onToggleCollapse }: TripNotebookProps) {
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const data = useMemo(() => categorizeArtifacts(artifacts), [artifacts]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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

    // Tab bar
    React.createElement('div', {
      style: {
        display: 'flex', gap: '0',
        borderBottom: '1px solid rgba(148,163,184,0.15)',
        flexShrink: 0, padding: '0 6px',
      },
    },
      ...TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const count = tabBadge(tab.id, data);
        return React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          style: {
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '8px 10px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: isActive ? 600 : 400,
            color: isActive ? '#0891b2' : 'var(--adaptive-text-secondary, #6b7280)',
            background: 'none',
            borderBottom: isActive ? '2px solid #0891b2' : '2px solid transparent',
            marginBottom: '-1px',
            transition: 'all 0.15s ease',
          },
        },
          React.createElement('span', { style: { fontSize: '13px' } }, tab.icon),
          tab.label,
          count > 0 && React.createElement('span', {
            style: {
              fontSize: '10px', fontWeight: 600,
              backgroundColor: isActive ? 'rgba(8,145,178,0.12)' : 'rgba(148,163,184,0.15)',
              color: isActive ? '#0891b2' : 'var(--adaptive-text-secondary)',
              borderRadius: '8px', padding: '0 5px', minWidth: '16px',
              textAlign: 'center' as const, lineHeight: '16px',
            },
          }, String(count))
        );
      })
    ),

    // Tab content
    React.createElement('div', {
      style: {
        flex: 1, minHeight: 0, overflowY: 'auto' as const,
        padding: '4px 14px 14px',
      } as React.CSSProperties,
    },
      activeTab === 'overview' && React.createElement(OverviewTab, { data, onRemove: handleRemove }),
      activeTab === 'travel' && React.createElement(TravelTab, { data, onRemove: handleRemove }),
      activeTab === 'budget' && React.createElement(BudgetTab, { data, onRemove: handleRemove }),
      activeTab === 'packing' && React.createElement(PackingTab, { data, onRemove: handleRemove })
    )
  );
}
