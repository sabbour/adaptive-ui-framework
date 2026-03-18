import type { ComponentPack } from '@sabbour/adaptive-ui-core';
import { FlightSearch, FlightCard } from './components';
import { GoogleFlightsSettings, getStoredCorsProxy } from './GoogleFlightsSettings';
import { buildFlightsUrl, type FlightLeg } from './protobuf';
import { parseFlightsHtml, formatDuration } from './parser';
import { trackedFetch } from '@sabbour/adaptive-ui-core';

const GOOGLE_FLIGHTS_SYSTEM_PROMPT = `
GOOGLE FLIGHTS PACK:

TOOLS (inference-time, LLM sees results):
- search_flights: Search Google Flights for real flight options. Returns prices, airlines, times, stops. Use to recommend specific flights with real data. Requires a CORS proxy to be configured.

COMPONENTS:

flightSearch — {from, to, date, returnDate?, trip?, seat?, adults?, bind?}
  Interactive flight results panel. Shows live results if CORS proxy is configured, otherwise shows a "Search on Google Flights" link with the exact query.
  from/to: 3-letter airport codes (e.g., "JFK", "NRT"). date/returnDate: YYYY-MM-DD format.
  trip: "one-way" | "round-trip" (default: one-way, auto-detects round-trip if returnDate given).
  seat: "economy" | "premium-economy" | "business" | "first".
  If bind is set, user can click a flight to select it (stores airline, price, stops, times).
  Example: {type:"flightSearch", from:"JFK", to:"NRT", date:"2026-04-15", seat:"economy", adults:2}
  Round trip: {type:"flightSearch", from:"{{state.fromAirport}}", to:"{{state.toAirport}}", date:"{{state.departDate}}", returnDate:"{{state.returnDate}}", trip:"round-trip"}

flightCard — {from, to, date, returnDate?, trip?, seat?, adults?}
  Styled link card that opens Google Flights with the exact search query (protobuf-encoded URL).
  Use for quick flight references without live results.
  Example: {type:"flightCard", from:"LAX", to:"CDG", date:"2026-06-01", returnDate:"2026-06-15", trip:"round-trip", seat:"economy"}

WHEN TO USE:
- search_flights TOOL: when LLM needs to see actual prices/times to make recommendations
- flightSearch COMPONENT: when showing the user flight options to browse/select
- flightCard COMPONENT: lightweight flight link in itinerary summaries

BEST PRACTICES:
- Use 3-letter IATA airport codes (JFK, LAX, NRT, CDG, LHR)
- Show flightSearch after departure city and dates are confirmed
- Use flightCard in final itinerary summaries for quick reference
- All string props support {{state.key}} interpolation
- Round trips auto-detect when returnDate is provided`;

export function createGoogleFlightsPack(): ComponentPack {
  return {
    name: 'google-flights',
    displayName: 'Google Flights',
    components: {
      flightSearch: FlightSearch,
      flightCard: FlightCard,
    },
    systemPrompt: GOOGLE_FLIGHTS_SYSTEM_PROMPT,
    settingsComponent: GoogleFlightsSettings,
    tools: [
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'search_flights',
            description: 'Search Google Flights for available flights. Returns real prices, airlines, times, and stops. Use when you need flight data to make recommendations. Requires a CORS proxy. Do NOT use for browsing — use the flightSearch component instead.',
            parameters: {
              type: 'object',
              properties: {
                from: {
                  type: 'string',
                  description: '3-letter IATA departure airport code (e.g., "JFK", "LAX")',
                },
                to: {
                  type: 'string',
                  description: '3-letter IATA arrival airport code (e.g., "NRT", "CDG")',
                },
                date: {
                  type: 'string',
                  description: 'Departure date in YYYY-MM-DD format',
                },
                returnDate: {
                  type: 'string',
                  description: 'Return date in YYYY-MM-DD format (for round trips)',
                },
                seat: {
                  type: 'string',
                  description: 'Seat class: economy, premium-economy, business, first',
                },
                adults: {
                  type: 'number',
                  description: 'Number of adult passengers (default: 1)',
                },
              },
              required: ['from', 'to', 'date'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const corsProxy = getStoredCorsProxy();
          if (!corsProxy) {
            // No proxy — return the URL for the user to search manually
            const from = String(args.from).toUpperCase();
            const to = String(args.to).toUpperCase();
            const date = String(args.date);
            const returnDate = args.returnDate ? String(args.returnDate) : undefined;
            const seat = (args.seat as string) ?? 'economy';
            const adults = Number(args.adults) || 1;
            const trip = returnDate ? 'round-trip' : 'one-way';

            const flights: FlightLeg[] = [{ date, from, to }];
            if (returnDate) flights.push({ date: returnDate, from: to, to: from });

            const url = buildFlightsUrl({ flights, seat: seat as any, trip: trip as any, adults });
            return `CORS proxy not configured — cannot fetch live results. Use the flightSearch or flightCard component instead to show the user a search link. Google Flights URL: ${url}`;
          }

          const from = String(args.from).toUpperCase();
          const to = String(args.to).toUpperCase();
          const date = String(args.date);
          const returnDate = args.returnDate ? String(args.returnDate) : undefined;
          const seat = (args.seat as string) ?? 'economy';
          const adults = Number(args.adults) || 1;
          const trip = returnDate ? 'round-trip' : 'one-way';

          const flights: FlightLeg[] = [{ date, from, to }];
          if (returnDate) flights.push({ date: returnDate, from: to, to: from });

          const url = buildFlightsUrl({ flights, seat: seat as any, trip: trip as any, adults });
          const proxyUrl = corsProxy.endsWith('/') ? corsProxy : corsProxy + '/';

          try {
            const res = await trackedFetch(proxyUrl + url, {
              headers: { 'Accept': 'text/html' },
            });
            if (!res.ok) return `Google Flights request failed: HTTP ${res.status}. The CORS proxy may be misconfigured.`;
            const html = await res.text();
            const parsed = parseFlightsHtml(html);

            if (parsed.length === 0) {
              return `No flights found for ${from} → ${to} on ${date}. Try different dates or airports. Google Flights URL: ${url}`;
            }

            // Return top 5 results
            const top = parsed.slice(0, 5).map((f, i) => ({
              rank: i + 1,
              price: f.price > 0 ? `$${f.price}` : 'Price unavailable',
              airlines: f.airlines.join(', '),
              stops: f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`,
              departure: f.legs[0]?.departureTime ?? '',
              arrival: f.legs[f.legs.length - 1]?.arrivalTime ?? '',
              duration: formatDuration(f.legs.reduce((sum, l) => sum + (l.duration || 0), 0)),
            }));

            return JSON.stringify({ from, to, date, results: top, totalFound: parsed.length, url }, null, 2);
          } catch (err) {
            return `Failed to search flights: ${err instanceof Error ? err.message : String(err)}. Google Flights URL: ${url}`;
          }
        },
      },
    ],
  };
}
