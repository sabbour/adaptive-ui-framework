// Lightweight global HTTP request tracker
// Components call track() to register requests, and React hooks subscribe to activity changes.

type Listener = () => void;

interface ActiveRequest {
  id: number;
  method: string;
  url: string;
  startTime: number;
}

export interface CompletedRequest {
  id: number;
  method: string;
  url: string;
  status: number;
  duration: number;
  ok: boolean;
  bodyPreview?: string;
  time: number;
}

let nextId = 0;
const active = new Map<number, ActiveRequest>();
const listeners = new Set<Listener>();
let snapshot: ActiveRequest[] = [];
const completedLog: CompletedRequest[] = [];
const completedListeners = new Set<Listener>();
let completedSnapshot: CompletedRequest[] = [];
const MAX_COMPLETED = 50;

function notify() {
  // Keep snapshot referentially stable between updates.
  snapshot = Array.from(active.values());
  listeners.forEach((fn) => fn());
}

function notifyCompleted() {
  completedSnapshot = [...completedLog];
  completedListeners.forEach((fn) => fn());
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
  const start = Date.now();
  try {
    const res = await fetch(input, init);
    trackEnd(id);
    // Log completed request for ARM debug panel
    const isArm = url.includes('management.azure.com');
    if (isArm) {
      const cloned = res.clone();
      cloned.text().then((body) => {
        if (completedLog.length >= MAX_COMPLETED) completedLog.shift();
        completedLog.push({
          id, method: method.toUpperCase(), url: url.replace(/https?:\/\/[^/]+/, '').split('?')[0],
          status: res.status, duration: Date.now() - start, ok: res.ok,
          bodyPreview: body.slice(0, 500),
          time: Date.now(),
        });
        notifyCompleted();
      }).catch(() => {});
    }
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

/** Get completed ARM request log. */
export function getCompletedRequests(): CompletedRequest[] {
  return completedSnapshot;
}

/** Subscribe to completed request log changes. */
export function subscribeCompleted(fn: Listener): () => void {
  completedListeners.add(fn);
  return () => completedListeners.delete(fn);
}
