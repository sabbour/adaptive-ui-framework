import React, { useState, useEffect } from 'react';
import type { AdaptiveComponentProps } from '../../framework/registry';
import type { AdaptiveNodeBase } from '../../framework/schema';
import { useAdaptive } from '../../framework/context';
import { interpolate } from '../../framework/interpolation';
import { getStoredApiKey } from './GoogleMapsSettings';

// ─── Helpers ───

function Banner({ message, type }: { message: string; type: 'error' | 'warning' }) {
  const styles = type === 'error'
    ? { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }
    : { backgroundColor: '#fffbeb', border: '1px solid #fed7aa', color: '#92400e' };
  return React.createElement('div', {
    style: { padding: '10px 14px', borderRadius: '8px', fontSize: '13px', ...styles },
  }, message);
}

// ═══════════════════════════════════════
// Google Maps Embed
// ═══════════════════════════════════════

interface GoogleMapsNode extends AdaptiveNodeBase {
  type: 'googleMaps';
  /** Map mode: place, directions, search, view, streetview */
  mode?: 'place' | 'directions' | 'search' | 'view' | 'streetview';
  /** Query or place name (for place/search modes) */
  query?: string;
  /** Origin for directions mode */
  origin?: string;
  /** Destination for directions mode */
  destination?: string;
  /** Center coordinates "lat,lng" (for view/streetview) */
  center?: string;
  /** Zoom level 0-21 */
  zoom?: number;
  /** Map type: roadmap, satellite */
  mapType?: 'roadmap' | 'satellite';
  /** Height in pixels (default: 400) */
  height?: number;
  /** Waypoints for directions, pipe-separated */
  waypoints?: string;
  /** Travel mode for directions */
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit';
}

export function GoogleMapsEmbed({ node }: AdaptiveComponentProps<GoogleMapsNode>) {
  const { state } = useAdaptive();
  const apiKey = getStoredApiKey();

  if (!apiKey) {
    return React.createElement(Banner, {
      message: 'Google Maps API key not configured. Add it in Settings → Google Maps.',
      type: 'warning',
    });
  }

  const mode = node.mode ?? 'place';

  // Interpolate all string props that may contain {{state.xxx}} references
  const resolveStr = (val?: string) => val ? interpolate(val, state) : undefined;
  const query = resolveStr(node.query);
  const origin = resolveStr(node.origin);
  const destination = resolveStr(node.destination);
  const center = resolveStr(node.center);
  const waypoints = resolveStr(node.waypoints);

  // Build the Embed API URL
  const params = new URLSearchParams();
  params.set('key', apiKey);

  let embedMode = mode;
  switch (mode) {
    case 'place':
      if (query) params.set('q', query);
      break;
    case 'search':
      if (query) params.set('q', query);
      break;
    case 'directions':
      if (origin) params.set('origin', origin);
      if (destination) params.set('destination', destination);
      if (waypoints) params.set('waypoints', waypoints);
      if (node.travelMode) params.set('mode', node.travelMode);
      break;
    case 'view':
      if (center) params.set('center', center);
      if (node.zoom) params.set('zoom', String(node.zoom));
      if (node.mapType) params.set('maptype', node.mapType);
      break;
    case 'streetview':
      if (center) params.set('location', center);
      break;
  }

  const src = `https://www.google.com/maps/embed/v1/${embedMode}?${params.toString()}`;
  const height = node.height ?? 400;

  return React.createElement('div', {
    style: {
      borderRadius: '8px', overflow: 'hidden',
      border: '1px solid #e5e7eb',
      ...node.style,
    } as React.CSSProperties,
    className: node.className,
  },
    React.createElement('iframe', {
      src,
      width: '100%',
      height,
      style: { border: 'none', display: 'block' },
      allowFullScreen: true,
      loading: 'lazy' as const,
      referrerPolicy: 'no-referrer-when-downgrade' as const,
    })
  );
}

// ═══════════════════════════════════════
// Google Places Search
// ═══════════════════════════════════════

interface GooglePlacesSearchNode extends AdaptiveNodeBase {
  type: 'googlePlacesSearch';
  /** Search query, supports {{state.key}} */
  query: string;
  /** State key to store the result */
  bind: string;
  /** Label for the search results */
  label?: string;
}

export function GooglePlacesSearch({ node }: AdaptiveComponentProps<GooglePlacesSearchNode>) {
  const { state, dispatch, disabled } = useAdaptive();
  const apiKey = getStoredApiKey();
  const [results, setResults] = useState<Array<{ name: string; address: string; placeId: string; rating?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = interpolate(node.query, state);

  useEffect(() => {
    if (disabled) return;
    if (!apiKey || !query) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Use the Places Text Search (New) API
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id,places.rating,places.location',
          },
          body: JSON.stringify({ textQuery: query }),
        });
        if (!res.ok) throw new Error(`Places API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const places = (data.places ?? []).map((p: any) => ({
            name: p.displayName?.text ?? '',
            address: p.formattedAddress ?? '',
            placeId: p.id ?? '',
            rating: p.rating,
            lat: p.location?.latitude,
            lng: p.location?.longitude,
          }));
          setResults(places);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, query]);

  if (!apiKey) {
    return React.createElement(Banner, {
      message: 'Google Maps API key not configured. Add it in Settings → Google Maps.',
      type: 'warning',
    });
  }

  if (loading) {
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
      'Searching places...'
    );
  }

  if (error) return React.createElement(Banner, { message: error, type: 'error' });

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '4px', ...node.style } as React.CSSProperties,
  },
    node.label && React.createElement('label', {
      style: { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' },
    }, node.label),
    results.length === 0
      ? React.createElement('div', { style: { fontSize: '13px', color: '#6b7280' } }, 'No results found')
      : results.map((place) =>
          React.createElement('div', {
            key: place.placeId,
            onClick: () => {
              dispatch({ type: 'SET', key: node.bind, value: place.name });
              dispatch({ type: 'SET', key: `${node.bind}_placeId`, value: place.placeId });
              dispatch({ type: 'SET', key: `${node.bind}_address`, value: place.address });
            },
            style: {
              padding: '10px 14px', borderRadius: '8px',
              border: '1px solid',
              borderColor: (state[node.bind] as string) === place.name ? '#2563eb' : '#e5e7eb',
              backgroundColor: (state[node.bind] as string) === place.name ? 'rgba(37, 99, 235, 0.06)' : '#fff',
              cursor: 'pointer', transition: 'border-color 0.15s',
            },
          },
            React.createElement('div', {
              style: { fontSize: '14px', fontWeight: 500 },
            }, place.name),
            React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
            }, place.address),
            place.rating && React.createElement('div', {
              style: { fontSize: '12px', color: '#d97706', marginTop: '2px' },
            }, `★ ${place.rating}`)
          )
        )
  );
}

// ═══════════════════════════════════════
// Google Nearby Places
// ═══════════════════════════════════════

interface GoogleNearbyNode extends AdaptiveNodeBase {
  type: 'googleNearby';
  /** Location query or "lat,lng" — supports {{state.key}} */
  location: string;
  /** Place type filter (e.g., restaurant, hotel, museum, cafe, bar, tourist_attraction) */
  placeType?: string;
  /** State key to store selected place */
  bind: string;
  /** Label for the section */
  label?: string;
  /** Max results (default: 8) */
  maxResults?: number;
}

export function GoogleNearby({ node }: AdaptiveComponentProps<GoogleNearbyNode>) {
  const { state, dispatch, disabled } = useAdaptive();
  const apiKey = getStoredApiKey();
  const [results, setResults] = useState<Array<{
    name: string; address: string; placeId: string;
    rating?: number; totalRatings?: number; priceLevel?: string;
    photoRef?: string; types?: string[];
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = interpolate(node.location, state);
  const maxResults = Math.min(node.maxResults ?? 8, 20);

  useEffect(() => {
    if (disabled) return;
    if (!apiKey || !location) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const query = node.placeType
          ? `${node.placeType} near ${location}`
          : `things to do near ${location}`;
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.types',
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: maxResults }),
        });
        if (!res.ok) throw new Error(`Places API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setResults((data.places ?? []).map((p: any) => ({
            name: p.displayName?.text ?? '',
            address: p.formattedAddress ?? '',
            placeId: p.id ?? '',
            rating: p.rating,
            totalRatings: p.userRatingCount,
            priceLevel: p.priceLevel,
            photoRef: p.photos?.[0]?.name,
            types: p.types?.slice(0, 3),
          })));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, location, node.placeType]);

  if (!apiKey) {
    return React.createElement(Banner, {
      message: 'Google Maps API key not configured. Add it in Settings → Google Maps.',
      type: 'warning',
    });
  }

  if (loading) {
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
      `Finding nearby places...`
    );
  }

  if (error) return React.createElement(Banner, { message: error, type: 'error' });

  const PRICE_LABELS: Record<string, string> = {
    'PRICE_LEVEL_FREE': 'Free',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
  };

  return React.createElement('div', {
    style: { ...node.style } as React.CSSProperties,
  },
    node.label && React.createElement('div', {
      style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#374151' },
    }, node.label),

    results.length === 0
      ? React.createElement('div', { style: { fontSize: '13px', color: '#6b7280', padding: '8px' } }, 'No nearby places found')
      : React.createElement('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px',
          } as React.CSSProperties,
        },
          ...results.map((place) => {
            const isSelected = (state[node.bind] as string) === place.name;
            const photoUrl = place.photoRef && apiKey
              ? `https://places.googleapis.com/v1/${place.photoRef}/media?maxHeightPx=200&maxWidthPx=300&key=${apiKey}`
              : null;

            return React.createElement('div', {
              key: place.placeId,
              onClick: () => {
                dispatch({ type: 'SET', key: node.bind, value: place.name });
                dispatch({ type: 'SET', key: `${node.bind}_placeId`, value: place.placeId });
                dispatch({ type: 'SET', key: `${node.bind}_address`, value: place.address });
              },
              style: {
                borderRadius: '10px', overflow: 'hidden', cursor: 'pointer',
                border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.04)' : '#fff',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: isSelected ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : 'none',
              },
            },
              // Photo
              photoUrl && React.createElement('div', {
                style: {
                  height: '120px', backgroundImage: `url(${photoUrl})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                } as React.CSSProperties,
              }),
              // Info
              React.createElement('div', { style: { padding: '10px 12px' } },
                React.createElement('div', {
                  style: { fontSize: '14px', fontWeight: 600, marginBottom: '2px' },
                }, place.name),
                React.createElement('div', {
                  style: { fontSize: '11px', color: '#6b7280', marginBottom: '4px' },
                }, place.address),
                React.createElement('div', {
                  style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' },
                },
                  place.rating && React.createElement('span', {
                    style: { color: '#d97706', fontWeight: 600 },
                  }, `★ ${place.rating}`),
                  place.totalRatings && React.createElement('span', {
                    style: { color: '#9ca3af' },
                  }, `(${place.totalRatings})`),
                  place.priceLevel && PRICE_LABELS[place.priceLevel] && React.createElement('span', {
                    style: { color: '#059669', fontWeight: 500 },
                  }, PRICE_LABELS[place.priceLevel])
                )
              )
            );
          })
        )
  );
}

// ═══════════════════════════════════════
// Google Photo Card
// ═══════════════════════════════════════

interface GooglePhotoCardNode extends AdaptiveNodeBase {
  type: 'googlePhotoCard';
  /** Place name to search for — supports {{state.key}} */
  query: string;
  /** Optional caption text */
  caption?: string;
  /** Height in pixels (default: 250) */
  height?: number;
}

export function GooglePhotoCard({ node }: AdaptiveComponentProps<GooglePhotoCardNode>) {
  const { state, disabled } = useAdaptive();
  const apiKey = getStoredApiKey();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [placeInfo, setPlaceInfo] = useState<{ name: string; rating?: number; address?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = interpolate(node.query, state);

  useEffect(() => {
    if (disabled) return;
    if (!apiKey || !query) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.photos',
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        });
        if (!res.ok) throw new Error(`Places API error: ${res.status}`);
        const data = await res.json();
        const place = data.places?.[0];
        if (!cancelled && place) {
          setPlaceInfo({
            name: place.displayName?.text ?? query,
            rating: place.rating,
            address: place.formattedAddress,
          });
          const photoRef = place.photos?.[0]?.name;
          if (photoRef) {
            setPhotoUrl(`https://places.googleapis.com/v1/${photoRef}/media?maxHeightPx=600&maxWidthPx=800&key=${apiKey}`);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, query]);

  if (!apiKey) {
    return React.createElement(Banner, {
      message: 'Google Maps API key not configured. Add it in Settings → Google Maps.',
      type: 'warning',
    });
  }

  if (loading) {
    return React.createElement('div', {
      style: {
        height: node.height ?? 250, borderRadius: '12px',
        backgroundColor: '#f3f4f6', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#9ca3af', fontSize: '13px',
      },
    }, `Loading ${query}...`);
  }

  if (error || !photoUrl) {
    return React.createElement('div', {
      style: {
        height: node.height ?? 250, borderRadius: '12px',
        backgroundColor: '#f3f4f6', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#6b7280', fontSize: '13px',
        border: '1px solid #e5e7eb',
      },
    }, `📍 ${placeInfo?.name ?? query}`);
  }

  const height = node.height ?? 250;

  return React.createElement('div', {
    style: {
      borderRadius: '12px', overflow: 'hidden',
      position: 'relative', height,
      ...node.style,
    } as React.CSSProperties,
  },
    // Photo
    React.createElement('img', {
      src: photoUrl,
      alt: placeInfo?.name ?? query,
      style: {
        width: '100%', height: '100%',
        objectFit: 'cover', display: 'block',
      } as React.CSSProperties,
    }),
    // Overlay with info
    React.createElement('div', {
      style: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        padding: '24px 16px 12px',
        color: '#fff',
      } as React.CSSProperties,
    },
      React.createElement('div', {
        style: { fontSize: '16px', fontWeight: 700 },
      }, placeInfo?.name ?? query),
      React.createElement('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', fontSize: '13px', opacity: 0.9 },
      },
        placeInfo?.rating && React.createElement('span', null, `★ ${placeInfo.rating}`),
        placeInfo?.address && React.createElement('span', null, placeInfo.address)
      ),
      node.caption && React.createElement('div', {
        style: { fontSize: '12px', opacity: 0.8, marginTop: '4px' },
      }, node.caption)
    )
  );
}
