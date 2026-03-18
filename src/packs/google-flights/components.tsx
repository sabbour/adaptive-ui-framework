import React, { useState, useEffect } from 'react';
import type { AdaptiveComponentProps } from '../../framework/registry';
import type { AdaptiveNodeBase } from '../../framework/schema';
import { useAdaptive } from '../../framework/context';
import { interpolate } from '../../framework/interpolation';
import { buildFlightsUrl } from './protobuf';
import { parseFlightsHtml, formatDuration, type FlightResult } from './parser';
import { getStoredCorsProxy } from './GoogleFlightsSettings';
import { trackedFetch } from '../../framework/request-tracker';

// ─── Helpers ───

function Banner({ message, type }: { message: string; type: 'error' | 'warning' }) {
  const styles = type === 'error'
    ? { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
    : { backgroundColor: '#fffbeb', border: '1px solid #fed7aa', color: '#92400e' };
  return React.createElement('div', {
    style: { padding: '10px 14px', borderRadius: '8px', fontSize: '13px', ...styles },
  }, message);
}

function LoadingSpinner({ label }: { label: string }) {
  return React.createElement('div', {
    style: { padding: '12px', color: '#6b7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
  },
    React.createElement('div', {
      style: {
        width: '16px', height: '16px', border: '2px solid #e5e7eb',
        borderTopColor: '#0ea5e9', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      },
    }),
    label
  );
}

// ═══════════════════════════════════════
// Flight Search Results
// ═══════════════════════════════════════

interface FlightSearchNode extends AdaptiveNodeBase {
  type: 'flightSearch';
  /** Departure airport code — supports {{state.key}} */
  from: string;
  /** Arrival airport code — supports {{state.key}} */
  to: string;
  /** Departure date YYYY-MM-DD — supports {{state.key}} */
  date: string;
  /** Return date YYYY-MM-DD (for round trips) — supports {{state.key}} */
  returnDate?: string;
  /** Trip type */
  trip?: 'one-way' | 'round-trip';
  /** Seat class */
  seat?: 'economy' | 'premium-economy' | 'business' | 'first';
  /** Number of adult passengers */
  adults?: number;
  /** State key to store selected flight */
  bind?: string;
}

export function FlightSearch({ node }: AdaptiveComponentProps<FlightSearchNode>) {
  const { state, dispatch, disabled } = useAdaptive();
  const [results, setResults] = useState<FlightResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'loading' | 'results' | 'link'>('loading');

  const from = interpolate(node.from, state);
  const to = interpolate(node.to, state);
  const date = interpolate(node.date, state);
  const returnDate = node.returnDate ? interpolate(node.returnDate, state) : undefined;
  const trip = node.trip ?? (returnDate ? 'round-trip' : 'one-way');
  const seat = node.seat ?? 'economy';
  const adults = node.adults ?? 1;

  const flights = [{ date, from, to }];
  if (returnDate && trip === 'round-trip') {
    flights.push({ date: returnDate, from: to, to: from });
  }

  const flightsUrl = buildFlightsUrl({ flights, seat, trip, adults });
  const corsProxy = getStoredCorsProxy();

  useEffect(() => {
    if (disabled) return;
    if (!from || !to || !date) return;
    if (!corsProxy) {
      setMode('link');
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const proxyUrl = corsProxy.endsWith('/') ? corsProxy : corsProxy + '/';
        const res = await trackedFetch(proxyUrl + flightsUrl, {
          headers: { 'Accept': 'text/html' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const parsed = parseFlightsHtml(html);
        if (!cancelled) {
          if (parsed.length > 0) {
            setResults(parsed.slice(0, 10));
            setMode('results');
          } else {
            setMode('link');
          }
        }
      } catch {
        if (!cancelled) setMode('link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [from, to, date, returnDate]);

  if (!from || !to || !date) {
    return React.createElement(Banner, {
      message: 'Missing flight search parameters (from, to, date).',
      type: 'warning',
    });
  }

  if (loading) {
    return React.createElement(LoadingSpinner, { label: `Searching flights ${from} → ${to}...` });
  }

  // Link-only mode (no CORS proxy or fetch failed)
  if (mode === 'link') {
    return React.createElement('div', {
      style: {
        borderRadius: '12px', border: '1px solid #e5e7eb',
        backgroundColor: '#fff', overflow: 'hidden',
        ...node.style,
      } as React.CSSProperties,
    },
      // Header
      React.createElement('div', {
        style: {
          padding: '16px 20px', backgroundColor: '#f0f9ff',
          borderBottom: '1px solid #bae6fd',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        },
      },
        React.createElement('div', null,
          React.createElement('div', {
            style: { fontSize: '16px', fontWeight: 700, color: '#0c4a6e' },
          }, `✈️ ${from} → ${to}`),
          React.createElement('div', {
            style: { fontSize: '13px', color: '#0369a1', marginTop: '2px' },
          }, `${date}${returnDate ? ` — ${returnDate}` : ''} · ${seat} · ${adults} passenger${adults > 1 ? 's' : ''}`)
        ),
        React.createElement('div', {
          style: {
            padding: '4px 10px', borderRadius: '12px',
            backgroundColor: '#e0f2fe', fontSize: '11px', color: '#0369a1',
            fontWeight: 600, textTransform: 'uppercase',
          } as React.CSSProperties,
        }, trip)
      ),

      // Action
      React.createElement('div', {
        style: { padding: '16px 20px', display: 'flex', justifyContent: 'center' },
      },
        React.createElement('a', {
          href: flightsUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '10px 24px', borderRadius: '8px',
            backgroundColor: '#0284c7', color: '#fff',
            fontSize: '14px', fontWeight: 600,
            textDecoration: 'none', cursor: 'pointer',
          },
        }, '🔍 Search on Google Flights')
      )
    );
  }

  // Results mode
  return React.createElement('div', {
    style: {
      borderRadius: '12px', border: '1px solid #e5e7eb',
      backgroundColor: '#fff', overflow: 'hidden',
      ...node.style,
    } as React.CSSProperties,
  },
    // Header
    React.createElement('div', {
      style: {
        padding: '14px 20px', backgroundColor: '#f0f9ff',
        borderBottom: '1px solid #bae6fd',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      React.createElement('div', {
        style: { fontSize: '15px', fontWeight: 700, color: '#0c4a6e' },
      }, `✈️ ${from} → ${to} · ${results.length} flights found`),
      React.createElement('a', {
        href: flightsUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { fontSize: '12px', color: '#0369a1', textDecoration: 'underline' },
      }, 'View all on Google Flights')
    ),

    // Flight cards
    React.createElement('div', {
      style: { maxHeight: '400px', overflowY: 'auto' } as React.CSSProperties,
    },
      ...results.map((flight, idx) => {
        const firstLeg = flight.legs[0];
        const lastLeg = flight.legs[flight.legs.length - 1];
        const isSelected = node.bind && (state[node.bind] as string) === `${flight.airlines.join('+')}:${flight.price}:${idx}`;
        const totalDuration = flight.legs.reduce((sum, l) => sum + (l.duration || 0), 0);

        return React.createElement('div', {
          key: idx,
          onClick: node.bind ? () => {
            const val = `${flight.airlines.join('+')}:${flight.price}:${idx}`;
            dispatch({ type: 'SET', key: node.bind!, value: val });
            dispatch({
              type: 'SET', key: `${node.bind}_details`,
              value: JSON.stringify({
                price: flight.price,
                airlines: flight.airlines,
                stops: flight.stops,
                departure: firstLeg?.departureTime,
                arrival: lastLeg?.arrivalTime,
                duration: totalDuration,
              }),
            });
          } : undefined,
          style: {
            padding: '14px 20px',
            borderBottom: '1px solid #f3f4f6',
            cursor: node.bind ? 'pointer' : 'default',
            backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.06)' : 'transparent',
            borderLeft: isSelected ? '3px solid #0ea5e9' : '3px solid transparent',
            transition: 'background-color 0.15s',
          },
        },
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
          },
            // Left: times + route
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' },
              },
                React.createElement('span', { style: { fontWeight: 700 } },
                  firstLeg?.departureTime ?? ''),
                React.createElement('span', { style: { color: '#9ca3af', fontSize: '12px' } }, '→'),
                React.createElement('span', { style: { fontWeight: 700 } },
                  lastLeg?.arrivalTime ?? '')
              ),
              React.createElement('div', {
                style: { fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'flex', gap: '12px' },
              },
                React.createElement('span', null, flight.airlines.join(', ')),
                totalDuration > 0 && React.createElement('span', null, formatDuration(totalDuration)),
                React.createElement('span', null,
                  flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`)
              )
            ),

            // Right: price
            React.createElement('div', {
              style: { textAlign: 'right', flexShrink: 0, marginLeft: '16px' } as React.CSSProperties,
            },
              React.createElement('div', {
                style: { fontSize: '18px', fontWeight: 700, color: '#0c4a6e' },
              }, flight.price > 0 ? `$${flight.price}` : '—'),
              React.createElement('div', {
                style: { fontSize: '11px', color: '#9ca3af' },
              }, seat)
            )
          )
        );
      })
    )
  );
}

// ═══════════════════════════════════════
// Flight Card (display-only, from tool data)
// ═══════════════════════════════════════

interface FlightCardNode extends AdaptiveNodeBase {
  type: 'flightCard';
  /** Departure airport code */
  from: string;
  /** Arrival airport code */
  to: string;
  /** Departure date */
  date: string;
  /** Return date (optional) */
  returnDate?: string;
  /** Trip type */
  trip?: 'one-way' | 'round-trip';
  /** Seat class */
  seat?: 'economy' | 'premium-economy' | 'business' | 'first';
  /** Adults count */
  adults?: number;
}

export function FlightCard({ node }: AdaptiveComponentProps<FlightCardNode>) {
  const { state } = useAdaptive();
  const from = interpolate(node.from, state);
  const to = interpolate(node.to, state);
  const date = interpolate(node.date, state);
  const returnDate = node.returnDate ? interpolate(node.returnDate, state) : undefined;
  const trip = node.trip ?? (returnDate ? 'round-trip' : 'one-way');
  const seat = node.seat ?? 'economy';
  const adults = node.adults ?? 1;

  const flights = [{ date, from, to }];
  if (returnDate && trip === 'round-trip') {
    flights.push({ date: returnDate, from: to, to: from });
  }

  const flightsUrl = buildFlightsUrl({ flights, seat, trip, adults });

  return React.createElement('a', {
    href: flightsUrl,
    target: '_blank',
    rel: 'noopener noreferrer',
    style: {
      display: 'block', textDecoration: 'none', color: 'inherit',
      borderRadius: '12px', border: '1px solid #bae6fd',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)',
      padding: '16px 20px', cursor: 'pointer',
      transition: 'box-shadow 0.2s',
      ...node.style,
    } as React.CSSProperties,
  },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      React.createElement('div', null,
        React.createElement('div', {
          style: { fontSize: '20px', fontWeight: 700, color: '#0c4a6e' },
        }, `✈️ ${from} → ${to}`),
        React.createElement('div', {
          style: { fontSize: '13px', color: '#0369a1', marginTop: '4px' },
        }, `${date}${returnDate ? ` — ${returnDate}` : ''}`),
        React.createElement('div', {
          style: { fontSize: '12px', color: '#0369a1', marginTop: '2px', display: 'flex', gap: '8px' },
        },
          React.createElement('span', {
            style: { padding: '2px 8px', borderRadius: '10px', backgroundColor: '#bae6fd', fontSize: '11px', fontWeight: 600 },
          }, seat),
          React.createElement('span', {
            style: { padding: '2px 8px', borderRadius: '10px', backgroundColor: '#bae6fd', fontSize: '11px', fontWeight: 600 },
          }, trip),
          React.createElement('span', {
            style: { padding: '2px 8px', borderRadius: '10px', backgroundColor: '#bae6fd', fontSize: '11px', fontWeight: 600 },
          }, `${adults} pax`)
        )
      ),
      React.createElement('div', {
        style: {
          padding: '8px 16px', borderRadius: '8px',
          backgroundColor: '#0284c7', color: '#fff',
          fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
        } as React.CSSProperties,
      }, 'Search Flights →')
    )
  );
}
