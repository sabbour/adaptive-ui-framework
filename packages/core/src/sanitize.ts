// ─── Spec Sanitizer ───
// Runs on every LLM response before rendering.
// Prevents XSS, URL injection, and state exfiltration.

import type { AdaptiveUISpec } from './schema';

// Sensitive state keys that should never leak into URLs or interpolated strings in URL contexts
const SENSITIVE_PREFIXES = ['__', 'token', 'apiKey', 'secret', 'password', 'credential'];

// Allowed URL protocols
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** Sanitize an entire spec from the LLM */
export function sanitizeSpec(spec: AdaptiveUISpec): AdaptiveUISpec {
  return sanitizeNode(spec) as AdaptiveUISpec;
}

/** Recursively sanitize a node tree */
function sanitizeNode(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeNode);

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize URL properties
    if (isUrlProperty(key) && typeof value === 'string') {
      result[key] = sanitizeUrl(value);
    }
    // Sanitize style properties — block expression injection
    else if (key === 'style' && typeof value === 'object' && value !== null) {
      result[key] = sanitizeStyle(value as Record<string, any>);
    }
    // Deep sanitize children/nested objects
    else {
      result[key] = sanitizeNode(value);
    }
  }
  return result;
}

/** Properties that contain URLs */
function isUrlProperty(key: string): boolean {
  return ['href', 'src', 'action', 'formAction', 'target'].includes(key);
}

/** Sanitize a URL — block javascript:, data:, and sensitive state interpolation */
export function sanitizeUrl(url: string): string {
  // Block dangerous protocols
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) {
    return '#blocked';
  }
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) {
    return '#blocked';
  }

  // Block interpolation of sensitive state keys in URLs
  const sensitivePattern = new RegExp(
    `\\{\\{\\s*(?:state\\.|st\\.)(${SENSITIVE_PREFIXES.join('|')})`,
    'i'
  );
  if (sensitivePattern.test(url)) {
    return '#blocked-sensitive';
  }

  // Validate protocol for absolute URLs
  if (url.includes('://') || url.startsWith('//')) {
    try {
      const parsed = new URL(url, 'https://placeholder.invalid');
      if (!SAFE_PROTOCOLS.includes(parsed.protocol)) {
        return '#blocked';
      }
    } catch {
      return '#blocked';
    }
  }

  return url;
}

/** Sanitize inline styles — strip expression() and url() with non-safe values */
function sanitizeStyle(style: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [prop, val] of Object.entries(style)) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      // Block CSS expression injection
      if (lower.includes('expression(') || lower.includes('javascript:')) {
        continue;
      }
      // Block url() with non-http sources
      if (lower.includes('url(') && !lower.includes('url(http')) {
        // Allow CSS variables and safe URLs
        if (!lower.includes('url(var(') && !lower.includes("url('http") && !lower.includes('url("http')) {
          continue;
        }
      }
    }
    result[prop] = val;
  }
  return result;
}

/** Sanitize interpolation — strip sensitive keys from state access */
export function sanitizeInterpolation(template: string): string {
  // Replace sensitive state interpolations with [REDACTED]
  return template.replace(
    /\{\{\s*(?:state\.|st\.)([\w.]+)\s*\}\}/g,
    (match, key) => {
      if (SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        return '[REDACTED]';
      }
      return match;
    }
  );
}
