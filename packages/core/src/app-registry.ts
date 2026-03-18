import React from 'react';

// ─── App Registry ───
// Apps register themselves here. The router picks the active one
// based on the URL hash (e.g., #basic, #my-app).
// If only one app is registered, it renders directly (no switcher).

export interface AppEntry {
  /** Unique slug used in URL hash (e.g., "basic") */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** The React component to render */
  component: React.ComponentType;
}

const apps: AppEntry[] = [];

/** Register an app */
export function registerApp(entry: AppEntry): void {
  if (!apps.find((a) => a.id === entry.id)) {
    apps.push(entry);
  }
}

/** Get all registered apps */
export function getApps(): AppEntry[] {
  return [...apps];
}

/** Get app by id */
export function getApp(id: string): AppEntry | undefined {
  return apps.find((a) => a.id === id);
}
