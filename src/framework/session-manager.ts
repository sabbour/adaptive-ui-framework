// ─── Session Manager ───
// Manages multiple conversation sessions with localStorage persistence.
// Each session stores its turns, state, and metadata.

type Listener = () => void;

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
}

interface StoredSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  turns: unknown[];
}

const STORAGE_PREFIX = 'adaptive-ui-session-';
const INDEX_KEY = 'adaptive-ui-sessions';

const listeners = new Set<Listener>();
let sessionIndex: Session[] | null = null;

function notify(): void {
  sessionIndex = null; // invalidate cache
  listeners.forEach((fn) => fn());
}

function loadIndex(): Session[] {
  if (sessionIndex) return sessionIndex;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      sessionIndex = JSON.parse(raw) as Session[];
      return sessionIndex;
    }
  } catch {}
  sessionIndex = [];
  return sessionIndex;
}

function saveIndex(sessions: Session[]): void {
  sessionIndex = sessions;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
  } catch {}
}

/** Get all saved sessions (sorted by most recent first) */
export function getSessions(): Session[] {
  return loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Subscribe to session list changes */
export function subscribeSessions(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Save a session (create or update) */
export function saveSession(id: string, name: string, turns: unknown[]): Session {
  const existing = loadIndex();
  const now = Date.now();
  const session: StoredSession = { id, name, createdAt: now, updatedAt: now, turns };

  // Check if session already exists
  const existingIdx = existing.findIndex((s) => s.id === id);
  if (existingIdx >= 0) {
    session.createdAt = existing[existingIdx].createdAt;
  }

  // Store session data
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(session));
  } catch {}

  // Update index
  const meta: Session = { id, name, createdAt: session.createdAt, updatedAt: now, turnCount: turns.length };
  if (existingIdx >= 0) {
    existing[existingIdx] = meta;
  } else {
    existing.push(meta);
  }
  saveIndex(existing);
  notify();
  return meta;
}

/** Load a session's turns */
export function loadSession(id: string): unknown[] | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (raw) {
      const session = JSON.parse(raw) as StoredSession;
      return session.turns;
    }
  } catch {}
  return null;
}

/** Delete a session */
export function deleteSession(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  } catch {}
  const existing = loadIndex().filter((s) => s.id !== id);
  saveIndex(existing);
  notify();
}

/** Generate a session ID */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
