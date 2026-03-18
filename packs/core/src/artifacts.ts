// ─── Artifacts Store ───
// Manages files/artifacts generated during conversations.
// Code blocks can be saved as artifacts, shown in a files panel, and downloaded.

type Listener = () => void;

export interface Artifact {
  id: string;
  filename: string;
  language: string;
  content: string;
  label?: string;
  createdAt: number;
}

let artifacts: Artifact[] = [];
const listeners = new Set<Listener>();
let snapshot: Artifact[] = [];
let counter = 0;

let STORAGE_KEY = 'adaptive-ui-artifacts';
const SESSION_ARTIFACTS_PREFIX = 'adaptive-ui-artifacts-';
let currentSessionId: string | null = null;

/** Scope artifacts global key to a specific app. Call before any artifact operations. */
export function setArtifactsScope(appId: string): void {
  STORAGE_KEY = appId ? `adaptive-ui-artifacts-${appId}` : 'adaptive-ui-artifacts';
}

/** Persist artifacts to localStorage */
function persist(): void {
  try {
    // Save to session-scoped key if a session is active
    if (currentSessionId) {
      localStorage.setItem(`${SESSION_ARTIFACTS_PREFIX}${currentSessionId}`, JSON.stringify(artifacts));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(artifacts));
  } catch { /* quota exceeded or unavailable */ }
}

/** Restore artifacts from localStorage on startup */
function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        artifacts = parsed;
        counter = artifacts.length;
        snapshot = [...artifacts];
      }
    }
  } catch { /* ignore corrupt data */ }
}

// Auto-restore on module load
restore();

function notify(): void {
  snapshot = [...artifacts];
  listeners.forEach((fn) => fn());
  persist();
}

/** Save a code block as an artifact */
export function saveArtifact(content: string, language: string, label?: string): Artifact {
  const id = `artifact-${++counter}-${Date.now()}`;
  const ext = LANG_EXTENSIONS[language] || language || 'txt';
  const baseName = label
    ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    : `artifact-${counter}`;
  const filename = `${baseName}.${ext}`;
  const artifact: Artifact = { id, filename, language, content, label, createdAt: Date.now() };
  artifacts.push(artifact);
  notify();
  return artifact;
}

/** Create or update an artifact by exact filename */
export function upsertArtifact(filename: string, content: string, language: string, label?: string): Artifact {
  const idx = artifacts.findIndex((a) => a.filename === filename);
  if (idx >= 0) {
    artifacts[idx] = { ...artifacts[idx], content, label: label ?? artifacts[idx].label };
    notify();
    return artifacts[idx];
  }
  const id = `artifact-${++counter}-${Date.now()}`;
  const artifact: Artifact = { id, filename, language, content, label, createdAt: Date.now() };
  artifacts.push(artifact);
  notify();
  return artifact;
}

/** Remove an artifact */
export function removeArtifact(id: string): void {
  artifacts = artifacts.filter((a) => a.id !== id);
  notify();
}

/** Clear all artifacts */
export function clearArtifacts(): void {
  artifacts = [];
  counter = 0;
  notify();
}

/** Get current artifacts snapshot */
export function getArtifacts(): Artifact[] {
  return snapshot;
}

/** Subscribe to artifact changes */
export function subscribeArtifacts(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Download an artifact as a file */
export function downloadArtifact(artifact: Artifact): void {
  const blob = new Blob([artifact.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artifact.filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Session-scoped artifact persistence ───

/** Save current artifacts to a specific session */
export function saveArtifactsForSession(sessionId: string): void {
  try {
    localStorage.setItem(`${SESSION_ARTIFACTS_PREFIX}${sessionId}`, JSON.stringify(artifacts));
  } catch { /* quota exceeded */ }
}

/** Load artifacts for a specific session (replaces in-memory artifacts) */
export function loadArtifactsForSession(sessionId: string): void {
  // Save current session's artifacts first
  if (currentSessionId && currentSessionId !== sessionId) {
    saveArtifactsForSession(currentSessionId);
  }
  currentSessionId = sessionId;
  try {
    const raw = localStorage.getItem(`${SESSION_ARTIFACTS_PREFIX}${sessionId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        artifacts = parsed;
        counter = artifacts.length;
        notify();
        return;
      }
    }
  } catch { /* ignore corrupt data */ }
  // No saved artifacts for this session — start fresh
  artifacts = [];
  counter = 0;
  notify();
}

/** Delete artifacts storage for a session */
export function deleteArtifactsForSession(sessionId: string): void {
  try {
    localStorage.removeItem(`${SESSION_ARTIFACTS_PREFIX}${sessionId}`);
  } catch {}
  // If we just deleted the active session's artifacts, clear in-memory too
  if (currentSessionId === sessionId) {
    artifacts = [];
    counter = 0;
    currentSessionId = null;
    notify();
  }
}

const LANG_EXTENSIONS: Record<string, string> = {
  bicep: 'bicep',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  bash: 'sh',
  shell: 'sh',
  dockerfile: 'Dockerfile',
  markdown: 'md',
  html: 'html',
  css: 'css',
  sql: 'sql',
  hcl: 'tf',
  terraform: 'tf',
  helm: 'yaml',
  xml: 'xml',
};
