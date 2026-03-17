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

function notify(): void {
  snapshot = [...artifacts];
  listeners.forEach((fn) => fn());
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
