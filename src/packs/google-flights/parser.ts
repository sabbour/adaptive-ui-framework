// ─── Google Flights HTML/JS Parser ───
// Extracts flight data from the JavaScript payload embedded in the Google Flights
// HTML response. Based on the parsing approach from github.com/AWeirdDev/flights.
//
// The HTML contains a <script class="ds:1"> tag with a `data:` payload
// that is a JSON array with flight results.

export interface FlightResult {
  price: number;
  currency?: string;
  airlines: string[];
  legs: FlightLeg[];
  totalDuration?: number;
  stops: number;
  carbonEmission?: number;
  typicalCarbon?: number;
}

export interface FlightLeg {
  fromAirport: { code: string; name: string };
  toAirport: { code: string; name: string };
  departureTime: string;
  departureDate: string;
  arrivalTime: string;
  arrivalDate: string;
  duration: number;
  planeType?: string;
}

/** Parse the Google Flights HTML response and extract flight results */
export function parseFlightsHtml(html: string): FlightResult[] {
  // Extract the script with class="ds:1"
  // The script contains: ...data:[ ... ],sideChannel:...
  // We need the data array
  const scriptMatch = html.match(/class="ds:1"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    // Try alternate pattern — look for the AF_initDataCallback with flights data
    return parseFromAfInit(html);
  }

  const scriptContent = scriptMatch[1];
  return parseJsPayload(scriptContent);
}

function parseFromAfInit(html: string): FlightResult[] {
  // Look for AF_initDataCallback patterns that contain flight data
  const callbacks = html.match(/AF_initDataCallback\(\{[^}]*data:([\s\S]*?)\}\);/g);
  if (!callbacks) return [];

  for (const cb of callbacks) {
    const dataMatch = cb.match(/data:([\s\S]*?),\s*sideChannel/);
    if (!dataMatch) continue;
    try {
      const data = JSON.parse(dataMatch[1]);
      if (data && data[3] && data[3][0]) {
        return extractFlights(data);
      }
    } catch { /* try next callback */ }
  }

  return [];
}

function parseJsPayload(js: string): FlightResult[] {
  // Extract data: [...] from the script
  const dataStart = js.indexOf('data:');
  if (dataStart === -1) return [];

  const jsonStr = js.slice(dataStart + 5).replace(/,\s*sideChannel[\s\S]*$/, '');
  try {
    const payload = JSON.parse(jsonStr);
    return extractFlights(payload);
  } catch {
    return [];
  }
}

function extractFlights(payload: any): FlightResult[] {
  const results: FlightResult[] = [];

  try {
    // payload[3][0] contains the flight results array
    const flightsList = payload?.[3]?.[0];
    if (!Array.isArray(flightsList)) return [];

    for (const item of flightsList) {
      try {
        const flight = item[0];
        const priceData = item[1];
        const price = priceData?.[0]?.[1] ?? priceData?.[1] ?? 0;

        const airlines: string[] = Array.isArray(flight[1])
          ? flight[1].map((a: any) => (typeof a === 'string' ? a : a?.[0] ?? ''))
          : [];

        const legs: FlightLeg[] = [];
        const singleFlights = flight[2];
        if (Array.isArray(singleFlights)) {
          for (const sf of singleFlights) {
            legs.push({
              fromAirport: { code: sf[3] ?? '', name: sf[4] ?? '' },
              toAirport: { code: sf[6] ?? '', name: sf[5] ?? '' },
              departureTime: sf[8] ?? '',
              departureDate: sf[20] ?? '',
              arrivalTime: sf[10] ?? '',
              arrivalDate: sf[21] ?? '',
              duration: sf[11] ?? 0,
              planeType: sf[17] ?? undefined,
            });
          }
        }

        const extras = flight[22];
        const carbonEmission = extras?.[7];
        const typicalCarbon = extras?.[8];

        results.push({
          price: typeof price === 'number' ? price : parseInt(String(price), 10) || 0,
          airlines,
          legs,
          stops: Math.max(0, legs.length - 1),
          carbonEmission,
          typicalCarbon,
        });
      } catch { /* skip malformed flight */ }
    }
  } catch { /* payload structure not as expected */ }

  return results;
}

/** Format duration in minutes to human-readable string */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
