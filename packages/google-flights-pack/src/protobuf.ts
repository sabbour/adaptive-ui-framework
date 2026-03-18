// ─── Minimal Protobuf Encoder ───
// Encodes Google Flights query parameters into the protobuf binary format
// used by the `tfs` URL parameter. Based on the proto schema from
// github.com/AWeirdDev/flights.
//
// Proto schema:
//   message Airport { string airport = 2; }
//   message FlightData {
//     string date = 2;
//     Airport from_airport = 13;
//     Airport to_airport = 14;
//     optional int32 max_stops = 5;
//     repeated string airlines = 6;
//   }
//   enum Seat { ECONOMY=1; PREMIUM_ECONOMY=2; BUSINESS=3; FIRST=4; }
//   enum Trip { ROUND_TRIP=1; ONE_WAY=2; MULTI_CITY=3; }
//   enum Passenger { ADULT=1; CHILD=2; INFANT_IN_SEAT=3; INFANT_ON_LAP=4; }
//   message Info {
//     repeated FlightData data = 3;
//     Seat seat = 9;
//     repeated Passenger passengers = 8;
//     Trip trip = 19;
//   }

// ─── Wire format helpers ───

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0; // unsigned
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return bytes;
}

function encodeTag(fieldNumber: number, wireType: number): number[] {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeString(fieldNumber: number, value: string): number[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(value);
  return [
    ...encodeTag(fieldNumber, 2), // wire type 2 = length-delimited
    ...encodeVarint(encoded.length),
    ...Array.from(encoded),
  ];
}

function encodeVarintField(fieldNumber: number, value: number): number[] {
  if (value === 0) return []; // default value, omit
  return [
    ...encodeTag(fieldNumber, 0), // wire type 0 = varint
    ...encodeVarint(value),
  ];
}

function encodeMessage(fieldNumber: number, messageBytes: number[]): number[] {
  return [
    ...encodeTag(fieldNumber, 2), // wire type 2 = length-delimited
    ...encodeVarint(messageBytes.length),
    ...messageBytes,
  ];
}

// ─── Message encoders ───

function encodeAirport(code: string): number[] {
  // message Airport { string airport = 2; }
  return encodeString(2, code);
}

function encodeFlightData(
  date: string,
  fromAirport: string,
  toAirport: string,
  maxStops?: number,
  airlines?: string[]
): number[] {
  const bytes: number[] = [];
  bytes.push(...encodeString(2, date));                              // date = 2
  if (maxStops !== undefined && maxStops !== null) {
    bytes.push(...encodeVarintField(5, maxStops));                   // max_stops = 5
  }
  if (airlines) {
    for (const airline of airlines) {
      bytes.push(...encodeString(6, airline));                       // airlines = 6 (repeated)
    }
  }
  bytes.push(...encodeMessage(13, encodeAirport(fromAirport)));     // from_airport = 13
  bytes.push(...encodeMessage(14, encodeAirport(toAirport)));       // to_airport = 14
  return bytes;
}

// ─── Enum values ───

export const SEAT = {
  economy: 1,
  'premium-economy': 2,
  business: 3,
  first: 4,
} as const;

export const TRIP = {
  'round-trip': 1,
  'one-way': 2,
} as const;

export const PASSENGER = {
  adult: 1,
  child: 2,
  infant_in_seat: 3,
  infant_on_lap: 4,
} as const;

// ─── Public API ───

export interface FlightLeg {
  date: string;       // YYYY-MM-DD
  from: string;       // 3-letter airport code
  to: string;         // 3-letter airport code
  maxStops?: number;
  airlines?: string[];
}

export interface FlightQueryParams {
  flights: FlightLeg[];
  seat?: keyof typeof SEAT;
  trip?: keyof typeof TRIP;
  adults?: number;
  children?: number;
  infantsInSeat?: number;
  infantsOnLap?: number;
  language?: string;
  currency?: string;
}

/** Encode a flight query into the protobuf binary format used by Google Flights */
export function encodeFlightQuery(params: FlightQueryParams): Uint8Array {
  const bytes: number[] = [];

  // repeated FlightData data = 3
  for (const leg of params.flights) {
    const flightBytes = encodeFlightData(leg.date, leg.from, leg.to, leg.maxStops, leg.airlines);
    bytes.push(...encodeMessage(3, flightBytes));
  }

  // repeated Passenger passengers = 8
  const adults = params.adults ?? 1;
  for (let i = 0; i < adults; i++) {
    bytes.push(...encodeVarintField(8, PASSENGER.adult));
  }
  for (let i = 0; i < (params.children ?? 0); i++) {
    bytes.push(...encodeVarintField(8, PASSENGER.child));
  }
  for (let i = 0; i < (params.infantsInSeat ?? 0); i++) {
    bytes.push(...encodeVarintField(8, PASSENGER.infant_in_seat));
  }
  for (let i = 0; i < (params.infantsOnLap ?? 0); i++) {
    bytes.push(...encodeVarintField(8, PASSENGER.infant_on_lap));
  }

  // Seat seat = 9
  const seatVal = SEAT[params.seat ?? 'economy'];
  bytes.push(...encodeVarintField(9, seatVal));

  // Trip trip = 19
  const tripVal = TRIP[params.trip ?? 'one-way'];
  bytes.push(...encodeVarintField(19, tripVal));

  return new Uint8Array(bytes);
}

/** Encode a flight query and return the base64 string for the `tfs` URL parameter */
export function encodeFlightQueryBase64(params: FlightQueryParams): string {
  const bytes = encodeFlightQuery(params);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Build the full Google Flights search URL */
export function buildFlightsUrl(params: FlightQueryParams): string {
  const tfs = encodeFlightQueryBase64(params);
  const hl = params.language || 'en';
  const curr = params.currency || '';
  let url = `https://www.google.com/travel/flights/search?tfs=${encodeURIComponent(tfs)}&hl=${hl}`;
  if (curr) url += `&curr=${curr}`;
  return url;
}
