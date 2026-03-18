import React, { useState, useEffect } from 'react';
import type { AdaptiveComponentProps } from '@sabbour/adaptive-ui-core';
import type { AdaptiveNodeBase } from '@sabbour/adaptive-ui-core';
import { useAdaptive } from '@sabbour/adaptive-ui-core';
import { interpolate } from '@sabbour/adaptive-ui-core';
import { trackedFetch } from '@sabbour/adaptive-ui-core';
import { upsertArtifact } from '@sabbour/adaptive-ui-core';

// ─── Helpers ───

function LoadingSpinner({ label }: { label: string }) {
  return React.createElement('div', {
    style: { padding: '12px', color: '#6b7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
  },
    React.createElement('div', {
      style: {
        width: '16px', height: '16px', border: '2px solid #e5e7eb',
        borderTopColor: '#059669', borderRadius: '50%',
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

const WEATHER_ICONS: Record<string, string> = {
  'Sunny': '☀️', 'Clear': '🌙', 'Partly cloudy': '⛅', 'Cloudy': '☁️',
  'Overcast': '☁️', 'Mist': '🌫️', 'Fog': '🌫️', 'Light rain': '🌦️',
  'Moderate rain': '🌧️', 'Heavy rain': '🌧️', 'Light drizzle': '🌦️',
  'Patchy rain possible': '🌦️', 'Patchy light rain': '🌦️',
  'Thundery outbreaks possible': '⛈️', 'Light snow': '🌨️', 'Snow': '❄️',
  'Heavy snow': '❄️', 'Blizzard': '❄️', 'Light sleet': '🌨️',
};

function weatherIcon(condition: string): string {
  return WEATHER_ICONS[condition] || '🌤️';
}

// ═══════════════════════════════════════
// Weather Card
// ═══════════════════════════════════════

interface WeatherCardNode extends AdaptiveNodeBase {
  type: 'weatherCard';
  /** City name, supports {{state.key}} */
  city: string;
}

export function WeatherCard({ node }: AdaptiveComponentProps<WeatherCardNode>) {
  const { state, disabled } = useAdaptive();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const city = interpolate(node.city, state);

  useEffect(() => {
    if (disabled) return;
    if (!city) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await trackedFetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json.data ?? json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch weather');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [city]);

  if (loading) return React.createElement(LoadingSpinner, { label: `Loading weather for ${city}...` });
  if (error) return React.createElement(Banner, { message: error, type: 'error' });
  if (!data) return null;

  const current = data.current_condition?.[0];
  const forecast = (data.weather ?? []).slice(0, 3);
  const condition = current?.weatherDesc?.[0]?.value ?? 'Unknown';

  return React.createElement('div', {
    style: {
      borderRadius: '12px', overflow: 'hidden',
      border: '1px solid #e5e7eb',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)',
      ...node.style,
    } as React.CSSProperties,
  },
    // Current weather header
    React.createElement('div', {
      style: { padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      React.createElement('div', null,
        React.createElement('div', {
          style: { fontSize: '13px', color: '#0369a1', fontWeight: 500, marginBottom: '4px' },
        }, city),
        React.createElement('div', {
          style: { fontSize: '36px', fontWeight: 700, color: '#0c4a6e', lineHeight: 1 },
        }, `${current?.temp_C ?? '--'}°C`),
        React.createElement('div', {
          style: { fontSize: '13px', color: '#0369a1', marginTop: '4px' },
        }, `Feels like ${current?.FeelsLikeC ?? '--'}°C · ${condition}`)
      ),
      React.createElement('div', {
        style: { fontSize: '48px', lineHeight: 1 },
      }, weatherIcon(condition))
    ),

    // Stats row
    React.createElement('div', {
      style: {
        display: 'flex', gap: '16px', padding: '8px 20px',
        backgroundColor: 'rgba(255,255,255,0.5)', fontSize: '12px', color: '#0369a1',
      },
    },
      React.createElement('span', null, `💧 ${current?.humidity ?? '--'}%`),
      React.createElement('span', null, `💨 ${current?.windspeedKmph ?? '--'} km/h`),
      React.createElement('span', null, `🌡️ ${current?.temp_F ?? '--'}°F`)
    ),

    // 3-day forecast
    forecast.length > 0 && React.createElement('div', {
      style: {
        display: 'flex', borderTop: '1px solid #bae6fd',
      },
    },
      ...forecast.map((day: any, i: number) => {
        const dayCondition = day.hourly?.[4]?.weatherDesc?.[0]?.value ?? 'Unknown';
        const rain = day.hourly?.[4]?.chanceofrain ?? '0';
        return React.createElement('div', {
          key: i,
          style: {
            flex: 1, padding: '12px', textAlign: 'center',
            borderRight: i < forecast.length - 1 ? '1px solid #bae6fd' : 'none',
            backgroundColor: 'rgba(255,255,255,0.3)',
          } as React.CSSProperties,
        },
          React.createElement('div', {
            style: { fontSize: '11px', color: '#0369a1', fontWeight: 500 },
          }, day.date ? new Date(day.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : `Day ${i + 1}`),
          React.createElement('div', { style: { fontSize: '24px', margin: '4px 0' } }, weatherIcon(dayCondition)),
          React.createElement('div', {
            style: { fontSize: '13px', fontWeight: 600, color: '#0c4a6e' },
          }, `${day.maxtempC ?? '--'}° / ${day.mintempC ?? '--'}°`),
          Number(rain) > 0 && React.createElement('div', {
            style: { fontSize: '11px', color: '#0369a1', marginTop: '2px' },
          }, `🌧 ${rain}%`)
        );
      })
    )
  );
}

// ═══════════════════════════════════════
// Country Info Card
// ═══════════════════════════════════════

interface CountryInfoCardNode extends AdaptiveNodeBase {
  type: 'countryInfoCard';
  /** Country name, supports {{state.key}} */
  country: string;
}

export function CountryInfoCard({ node }: AdaptiveComponentProps<CountryInfoCardNode>) {
  const { state, disabled } = useAdaptive();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const country = interpolate(node.country, state);

  useEffect(() => {
    if (disabled) return;
    if (!country) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await trackedFetch(
          `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,region,subregion,population,languages,currencies,timezones,idd,car,flag,flags`
        );
        if (!res.ok) throw new Error(`Country API error: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(Array.isArray(json) ? json[0] : json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch country info');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [country]);

  if (loading) return React.createElement(LoadingSpinner, { label: `Loading info for ${country}...` });
  if (error) return React.createElement(Banner, { message: error, type: 'error' });
  if (!data) return null;

  const languages = data.languages ? Object.values(data.languages).join(', ') : 'N/A';
  const currencies = data.currencies
    ? Object.entries(data.currencies).map(([code, v]: [string, any]) => `${v.symbol ?? ''} ${v.name} (${code})`).join(', ')
    : 'N/A';
  const callingCode = data.idd?.root ? data.idd.root + (data.idd.suffixes?.[0] || '') : 'N/A';
  const flagUrl = data.flags?.svg || data.flags?.png;

  const infoRow = (icon: string, label: string, value: string) =>
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' },
    },
      React.createElement('span', { style: { fontSize: '16px', width: '24px', textAlign: 'center' } as React.CSSProperties }, icon),
      React.createElement('span', { style: { fontSize: '12px', color: '#6b7280', minWidth: '80px' } }, label),
      React.createElement('span', { style: { fontSize: '13px', fontWeight: 500 } }, value)
    );

  return React.createElement('div', {
    style: {
      borderRadius: '12px', overflow: 'hidden',
      border: '1px solid #e5e7eb', backgroundColor: '#fff',
      ...node.style,
    } as React.CSSProperties,
  },
    // Header with flag
    React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 20px', backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
      },
    },
      flagUrl
        ? React.createElement('img', {
            src: flagUrl, alt: '', width: 48, height: 32,
            style: { borderRadius: '4px', border: '1px solid #e5e7eb', objectFit: 'cover' } as React.CSSProperties,
          })
        : React.createElement('span', { style: { fontSize: '32px' } }, data.flag ?? '🏳️'),
      React.createElement('div', null,
        React.createElement('div', {
          style: { fontSize: '18px', fontWeight: 700 },
        }, data.name?.common ?? country),
        React.createElement('div', {
          style: { fontSize: '12px', color: '#6b7280' },
        }, `${data.region ?? ''} · ${data.subregion ?? ''}`)
      )
    ),

    // Info rows
    React.createElement('div', {
      style: { padding: '12px 20px' },
    },
      infoRow('🏛️', 'Capital', Array.isArray(data.capital) ? data.capital.join(', ') : (data.capital ?? 'N/A')),
      infoRow('🗣️', 'Languages', languages),
      infoRow('💰', 'Currency', currencies),
      infoRow('🕐', 'Timezone', Array.isArray(data.timezones) ? data.timezones[0] : (data.timezones ?? 'N/A')),
      infoRow('🚗', 'Drives on', data.car?.side ?? 'N/A'),
      infoRow('📞', 'Calling', callingCode),
      infoRow('👥', 'Population', data.population ? Number(data.population).toLocaleString() : 'N/A')
    )
  );
}

// ═══════════════════════════════════════
// Currency Converter
// ═══════════════════════════════════════

interface CurrencyConverterNode extends AdaptiveNodeBase {
  type: 'currencyConverter';
  /** Default source currency, supports {{state.key}} */
  from?: string;
  /** Default target currency, supports {{state.key}} */
  to?: string;
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'KRW', 'MXN', 'BRL', 'THB', 'TRY', 'MAD', 'EGP', 'ZAR', 'SGD', 'HKD', 'NZD'];

export function CurrencyConverter({ node }: AdaptiveComponentProps<CurrencyConverterNode>) {
  const { state, disabled } = useAdaptive();
  const [fromCur, setFromCur] = useState(node.from ? interpolate(node.from, state) : 'USD');
  const [toCur, setToCur] = useState(node.to ? interpolate(node.to, state) : 'EUR');
  const [amount, setAmount] = useState('100');
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled) return;
    if (!fromCur || !toCur) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await trackedFetch(`https://open.er-api.com/v6/latest/${fromCur}`);
        if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const r = data.rates?.[toCur];
          if (r) setRate(r);
          else setError(`Currency ${toCur} not found`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch rate');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fromCur, toCur]);

  const numAmount = parseFloat(amount) || 0;
  const converted = rate ? (numAmount * rate).toFixed(2) : '--';

  const currencySelect = (value: string, onChange: (v: string) => void) =>
    React.createElement('select', {
      value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value),
      style: {
        flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #e5e7eb',
        fontSize: '14px', fontWeight: 500, backgroundColor: '#fff', cursor: 'pointer',
        color: '#1e293b', appearance: 'none' as const,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M2 4l4 4 4-4\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: '32px',
      },
    },
      ...COMMON_CURRENCIES.map((c) =>
        React.createElement('option', { key: c, value: c }, c)
      )
    );

  return React.createElement('div', {
    style: {
      borderRadius: '16px', border: '1px solid #e2e8f0',
      backgroundColor: '#fff', overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
      ...node.style,
    } as React.CSSProperties,
  },
    // Header
    React.createElement('div', {
      style: {
        padding: '14px 20px',
        background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
        display: 'flex', alignItems: 'center', gap: '8px',
      },
    },
      React.createElement('span', { style: { fontSize: '18px' } }, '💱'),
      React.createElement('span', {
        style: { fontSize: '14px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' },
      }, 'Currency Converter')
    ),

    React.createElement('div', { style: { padding: '20px' } },

      // From section
      React.createElement('div', {
        style: {
          backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px',
          border: '1px solid #e2e8f0', marginBottom: '12px',
        },
      },
        React.createElement('div', {
          style: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
        }, 'From'),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', alignItems: 'center' },
        },
          React.createElement('input', {
            type: 'number',
            value: amount,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value),
            style: {
              width: '120px', padding: '10px 14px', borderRadius: '10px',
              border: '1px solid #e2e8f0', fontSize: '20px', fontWeight: 700,
              color: '#0f172a', backgroundColor: '#fff',
              boxSizing: 'border-box' as const,
              outline: 'none',
            },
          }),
          currencySelect(fromCur, setFromCur)
        )
      ),

      // Swap button
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'center', margin: '-6px 0', position: 'relative' as const, zIndex: 1 },
      },
        React.createElement('button', {
          onClick: () => { const tmp = fromCur; setFromCur(toCur); setToCur(tmp); },
          style: {
            background: '#fff', border: '2px solid #e2e8f0', borderRadius: '50%',
            width: '36px', height: '36px', cursor: 'pointer', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#0891b2', fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.15s ease',
          },
        }, '⇅')
      ),

      // To section
      React.createElement('div', {
        style: {
          backgroundColor: '#f0fdfa', borderRadius: '12px', padding: '14px',
          border: '1px solid #ccfbf1', marginTop: '12px',
        },
      },
        React.createElement('div', {
          style: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
        }, 'To'),
        React.createElement('div', {
          style: { display: 'flex', gap: '10px', alignItems: 'center' },
        },
          React.createElement('div', {
            style: {
              width: '120px', padding: '10px 14px', borderRadius: '10px',
              backgroundColor: '#fff', border: '1px solid #ccfbf1',
              fontSize: '20px', fontWeight: 700,
              color: loading ? '#94a3b8' : '#0891b2',
            },
          }, loading ? '...' : converted),
          currencySelect(toCur, setToCur)
        )
      ),

      // Rate info
      rate && !loading && React.createElement('div', {
        style: {
          fontSize: '12px', color: '#64748b', textAlign: 'center',
          marginTop: '14px', padding: '8px 12px',
          backgroundColor: '#f8fafc', borderRadius: '8px',
        } as React.CSSProperties,
      }, `1 ${fromCur} = ${rate.toFixed(4)} ${toCur}`),

      error && React.createElement('div', {
        style: {
          fontSize: '12px', color: '#991b1b', textAlign: 'center',
          marginTop: '14px', padding: '8px 12px',
          backgroundColor: '#fef2f2', borderRadius: '8px',
          border: '1px solid #fecaca',
        } as React.CSSProperties,
      }, error)
    )
  );
}

// ═══════════════════════════════════════
// Travel Checklist
// ═══════════════════════════════════════

interface TravelChecklistNode extends AdaptiveNodeBase {
  type: 'travelChecklist';
  /** Checklist title */
  title?: string;
  /** Items as string array or comma-separated string */
  items: string[] | string;
  /** State key to store checked items */
  bind: string;
}

export function TravelChecklist({ node }: AdaptiveComponentProps<TravelChecklistNode>) {
  const { state, dispatch } = useAdaptive();

  const items: string[] = Array.isArray(node.items)
    ? node.items
    : (typeof node.items === 'string' ? node.items.split(',').map((s) => s.trim()).filter(Boolean) : []);

  const checkedRaw = (state[node.bind] as string) ?? '';
  const checked = new Set(checkedRaw ? checkedRaw.split('||') : []);
  const progress = items.length > 0 ? Math.round((checked.size / items.length) * 100) : 0;

  const toggle = (item: string) => {
    const next = new Set(checked);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    dispatch({ type: 'SET', key: node.bind, value: Array.from(next).join('||') });
  };

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
        padding: '14px 20px', backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      React.createElement('div', {
        style: { fontSize: '14px', fontWeight: 600, color: '#374151' },
      }, node.title ?? '✅ Checklist'),
      React.createElement('div', {
        style: { fontSize: '12px', color: '#6b7280' },
      }, `${checked.size}/${items.length} (${progress}%)`)
    ),

    // Progress bar
    React.createElement('div', {
      style: { height: '3px', backgroundColor: '#e5e7eb' },
    },
      React.createElement('div', {
        style: {
          height: '100%', width: `${progress}%`,
          backgroundColor: progress === 100 ? '#22c55e' : '#059669',
          transition: 'width 0.3s ease',
        },
      })
    ),

    // Items
    React.createElement('div', {
      style: { padding: '8px 12px', maxHeight: '300px', overflowY: 'auto' } as React.CSSProperties,
    },
      ...items.map((item) => {
        const isChecked = checked.has(item);
        return React.createElement('div', {
          key: item,
          onClick: () => toggle(item),
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px', borderRadius: '6px', cursor: 'pointer',
            transition: 'background-color 0.15s',
          },
          onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f1f5f9';
          },
          onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
          },
        },
          React.createElement('div', {
            style: {
              width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
              border: isChecked ? 'none' : '2px solid #d1d5db',
              backgroundColor: isChecked ? '#059669' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '12px', fontWeight: 700,
              transition: 'all 0.15s',
            },
          }, isChecked ? '✓' : null),
          React.createElement('span', {
            style: {
              fontSize: '14px',
              textDecoration: isChecked ? 'line-through' : 'none',
              color: isChecked ? '#9ca3af' : '#374151',
              transition: 'all 0.15s',
            },
          }, item)
        );
      })
    )
  );
}

// ═══════════════════════════════════════
// Budget Tracker
// ═══════════════════════════════════════

interface BudgetItemInput {
  category: string;
  amount: number;
  note?: string;
}

interface BudgetTrackerNode extends AdaptiveNodeBase {
  type: 'budgetTracker';
  /** Budget line items provided by the LLM */
  items: BudgetItemInput[];
  /** Currency code (default: USD) */
  currency?: string;
  /** Title override */
  title?: string;
  /** State key to store the total */
  bind?: string;
}

export function BudgetTracker({ node }: AdaptiveComponentProps<BudgetTrackerNode>) {
  const { state, dispatch, disabled } = useAdaptive();

  const currency = node.currency
    ? interpolate(node.currency, state)
    : 'USD';

  const items: BudgetItemInput[] = Array.isArray(node.items) ? node.items : [];
  const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);

  // Store total in state if bind is set
  useEffect(() => {
    if (node.bind && total > 0) {
      dispatch({ type: 'SET', key: node.bind, value: String(total) });
    }
  }, [total, node.bind, dispatch]);

  // Save budget items as artifacts for the TripNotebook panel
  useEffect(() => {
    if (disabled) return;
    for (const item of items) {
      if (item.amount > 0) {
        const filename = `budget-${item.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        upsertArtifact(filename, JSON.stringify({
          category: item.category,
          amount: item.amount,
          currency,
          note: item.note,
        }), 'json', `${item.category}: ${currency} ${item.amount.toLocaleString()}`);
      }
    }
  }, [items.length, disabled, currency]);

  const categoryEmoji: Record<string, string> = {
    flights: '\u2708\uFE0F', hotel: '\uD83C\uDFE8', accommodation: '\uD83C\uDFE8',
    food: '\uD83C\uDF7D\uFE0F', dining: '\uD83C\uDF7D\uFE0F', restaurants: '\uD83C\uDF7D\uFE0F',
    activities: '\uD83C\uDFAF', entertainment: '\uD83C\uDFAD', sightseeing: '\uD83D\uDDFC',
    transport: '\uD83D\uDE95', taxi: '\uD83D\uDE95', transit: '\uD83D\uDE87',
    shopping: '\uD83D\uDECD\uFE0F', souvenirs: '\uD83C\uDF81',
    insurance: '\uD83D\uDEE1\uFE0F', visa: '\uD83D\uDCC4',
    other: '\uD83D\uDCE6', misc: '\uD83D\uDCE6', tips: '\uD83D\uDCB5',
  };

  const categoryColors: Record<string, string> = {
    flights: '#0891b2', hotel: '#8b5cf6', accommodation: '#8b5cf6',
    food: '#f97066', dining: '#f97066', restaurants: '#f97066',
    activities: '#f59e0b', entertainment: '#f59e0b', sightseeing: '#f59e0b',
    transport: '#059669', taxi: '#059669', transit: '#059669',
    shopping: '#ec4899', souvenirs: '#ec4899',
    insurance: '#6366f1', visa: '#6366f1',
    other: '#6b7280', misc: '#6b7280', tips: '#6b7280',
  };

  return React.createElement('div', {
    style: {
      borderRadius: '12px', border: '1px solid #e5e7eb',
      backgroundColor: '#fff', overflow: 'hidden',
      ...node.style,
    } as React.CSSProperties,
  },
    // Header with total
    React.createElement('div', {
      style: {
        padding: '14px 20px', backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      },
    },
      React.createElement('div', {
        style: { fontSize: '14px', fontWeight: 600, color: '#374151' },
      }, node.title ?? '\uD83D\uDCB0 Trip Budget'),
      React.createElement('div', {
        style: { fontSize: '16px', fontWeight: 700, color: '#0891b2' },
      }, `${currency} ${total.toLocaleString()}`)
    ),

    // Category breakdown bar
    items.length > 1 && React.createElement('div', {
      style: { display: 'flex', height: '4px', gap: '1px' },
    },
      ...items.map((item, i) =>
        React.createElement('div', {
          key: `bar-${i}`,
          title: `${item.category}: ${item.amount.toLocaleString()}`,
          style: {
            flex: item.amount,
            backgroundColor: categoryColors[item.category.toLowerCase()] || '#6b7280',
            minWidth: '3px',
          },
        })
      )
    ),

    // Line items
    React.createElement('div', {
      style: { padding: '8px 12px' },
    },
      ...items.map((item, i) => {
        const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return React.createElement('div', {
          key: `item-${i}`,
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px', borderRadius: '6px',
          },
        },
          React.createElement('span', { style: { fontSize: '16px', flexShrink: 0 } },
            categoryEmoji[item.category.toLowerCase()] || '\uD83D\uDCE6'),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', {
              style: { fontSize: '14px', fontWeight: 500, color: '#374151' },
            }, item.note || item.category),
            React.createElement('div', {
              style: { fontSize: '12px', color: '#9ca3af', marginTop: '1px' },
            }, `${pct}% of total`)
          ),
          React.createElement('span', {
            style: {
              fontSize: '14px', fontWeight: 600, color: '#374151',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            },
          }, `${currency} ${item.amount.toLocaleString()}`)
        );
      })
    ),

    // Per-person note if more than 1 traveler
    state['travelers'] && Number(state['travelers']) > 1 && React.createElement('div', {
      style: {
        padding: '8px 20px 12px', fontSize: '12px', color: '#6b7280',
        borderTop: '1px solid #f1f5f9',
      },
    }, `\u2248 ${currency} ${Math.round(total / Number(state['travelers'])).toLocaleString()} per person (${state['travelers']} travelers)`)
  );
}
