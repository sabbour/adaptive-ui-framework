// Lightweight global HTTP request tracker
// Components call track() to register requests, and React hooks subscribe to activity changes.

type Listener = () => void;

interface ActiveRequest {
  id: number;
  method: string;
  url: string;
  startTime: number;
}

let nextId = 0;
const active = new Map<number, ActiveRequest>();
const listeners = new Set<Listener>();
let snapshot: ActiveRequest[] = [];

function notify() {
  // Keep snapshot referentially stable between updates.
  snapshot = Array.from(active.values());
  listeners.forEach((fn) => fn());
}

/** Start tracking a request. Returns an id to pass to `end()`. */
export function trackStart(method: string, url: string): number {
  const id = ++nextId;
  // Shorten URL for display
  const short = url.replace(/https?:\/\/[^/]+/, '').split('?')[0];
  active.set(id, { id, method: method.toUpperCase(), url: short, startTime: Date.now() });
  notify();
  return id;
}

/** Mark a tracked request as finished. */
export function trackEnd(id: number): void {
  active.delete(id);
  notify();
}

/** Wrap a fetch call with tracking. */
export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? 'GET';
  const id = trackStart(method, url);
  try {
    const res = await fetch(input, init);
    trackEnd(id);
    return res;
  } catch (err) {
    trackEnd(id);
    throw err;
  }
}

/** Get current active requests. */
export function getActiveRequests(): ActiveRequest[] {
  return snapshot;
}

/** Subscribe to changes. Returns unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
