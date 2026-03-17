// ─── Decision Log ───
// Captures logical decisions made by the framework pipeline:
// LLM adapter → compact expansion → intent resolution → renderer fallback.
// Shown in the debug panel so users can trace why the UI looks the way it does.

export interface DecisionEntry {
  /** Pipeline stage */
  stage: 'adapter' | 'intent' | 'renderer';
  /** What happened */
  message: string;
  /** Timestamp */
  time: number;
}

let currentLog: DecisionEntry[] = [];

/** Clear the log (call at the start of each LLM request) */
export function resetDecisionLog(): void {
  currentLog = [];
}

/** Append a decision */
export function logDecision(stage: DecisionEntry['stage'], message: string): void {
  currentLog.push({ stage, message, time: Date.now() });
}

/** Get a snapshot of the current log */
export function getDecisionLog(): DecisionEntry[] {
  return [...currentLog];
}
