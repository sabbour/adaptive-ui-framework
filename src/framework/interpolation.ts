import type { AdaptiveValue } from './schema';

// ─── State interpolation engine ───
// Resolves {{state.key}} and {{item.key}} references in strings and booleans.

export type StateStore = Record<string, AdaptiveValue | AdaptiveValue[] | Record<string, AdaptiveValue>[]>;

/** Keys that are considered sensitive and must not be interpolated into rendered output */
const SENSITIVE_KEY_RE = /^__|password|secret|token|apiKey|credential|connectionString/i;

/** Interpolate {{state.xxx}} / {{st.xxx}} and {{item.xxx}} in a string */
export function interpolate(
  template: string,
  state: StateStore,
  itemContext?: Record<string, AdaptiveValue>,
  itemIndex?: number
): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();

    if (trimmed === 'item._index' && itemIndex !== undefined) {
      return String(itemIndex);
    }

    if (trimmed.startsWith('item.') && itemContext) {
      const key = trimmed.slice(5);
      return String(itemContext[key] ?? '');
    }

    if (trimmed.startsWith('state.') || trimmed.startsWith('st.')) {
      const key = trimmed.startsWith('state.') ? trimmed.slice(6) : trimmed.slice(3);
      // Block sensitive state keys from leaking into rendered output
      if (SENSITIVE_KEY_RE.test(key)) return '[REDACTED]';
      const val = state[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }

    return '';
  });
}

/** Resolve a value that might be a string with interpolation or a raw boolean */
export function resolveValue(
  value: boolean | string | undefined,
  state: StateStore,
  defaultValue: boolean = true
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  const resolved = interpolate(value, state);
  return resolved === 'true' || resolved === '1';
}

/** Deep-interpolate all string values in an object */
export function interpolateDeep<T>(
  obj: T,
  state: StateStore,
  itemContext?: Record<string, AdaptiveValue>,
  itemIndex?: number
): T {
  if (typeof obj === 'string') {
    return interpolate(obj, state, itemContext, itemIndex) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateDeep(item, state, itemContext, itemIndex)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = interpolateDeep(val, state, itemContext, itemIndex);
    }
    return result as T;
  }
  return obj;
}
