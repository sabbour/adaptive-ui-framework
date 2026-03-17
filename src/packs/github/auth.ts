// ─── GitHub Auth ───
// Supports two auth methods:
// 1. OAuth Device Flow — uses GitHub OAuth App client_id + CORS proxy
//    (github.com/login/* doesn't allow browser CORS, so we route through a proxy)
// 2. Personal Access Token (PAT) — direct token entry (api.github.com supports CORS)

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const POLL_INTERVAL = 5000;

// Storage keys
const STORAGE_TOKEN = 'adaptive-ui-github-token';
const STORAGE_USER = 'adaptive-ui-github-user';
const STORAGE_CLIENT_ID = 'adaptive-ui-github-client-id';
const STORAGE_CORS_PROXY = 'adaptive-ui-github-cors-proxy';

let cachedToken: string | null = null;
let cachedUser: string | null = null;

// ─── Token Storage ───

export function getStoredToken(): string | null {
  if (!cachedToken) {
    try { cachedToken = localStorage.getItem(STORAGE_TOKEN); } catch {}
  }
  return cachedToken;
}

export function getStoredUser(): string | null {
  if (!cachedUser) {
    try { cachedUser = localStorage.getItem(STORAGE_USER); } catch {}
  }
  return cachedUser;
}

export function storeAuth(token: string | null, user: string | null): void {
  cachedToken = token;
  cachedUser = user;
  try {
    if (token) localStorage.setItem(STORAGE_TOKEN, token);
    else localStorage.removeItem(STORAGE_TOKEN);
    if (user) localStorage.setItem(STORAGE_USER, user);
    else localStorage.removeItem(STORAGE_USER);
  } catch {}
}

export function getStoredClientId(): string {
  try { return localStorage.getItem(STORAGE_CLIENT_ID) || ''; } catch { return ''; }
}

export function storeClientId(clientId: string): void {
  try {
    if (clientId) localStorage.setItem(STORAGE_CLIENT_ID, clientId);
    else localStorage.removeItem(STORAGE_CLIENT_ID);
  } catch {}
}

export function getStoredCorsProxy(): string {
  try { return localStorage.getItem(STORAGE_CORS_PROXY) || ''; } catch { return ''; }
}

export function storeCorsProxy(proxy: string): void {
  try {
    if (proxy) localStorage.setItem(STORAGE_CORS_PROXY, proxy);
    else localStorage.removeItem(STORAGE_CORS_PROXY);
  } catch {}
}

/** Proxy a URL through the configured CORS proxy */
function proxied(url: string): string {
  const proxy = getStoredCorsProxy();
  if (!proxy) return url;
  // Proxy format: "https://proxy.example.com/" + target URL
  const base = proxy.endsWith('/') ? proxy : proxy + '/';
  return base + url;
}

// ─── PAT Auth ───

export async function loginWithPAT(token: string): Promise<{ login: string; name: string | null; avatar_url: string }> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Authentication failed (${res.status})`);
  const data = await res.json();
  storeAuth(token, data.login);
  return { login: data.login, name: data.name, avatar_url: data.avatar_url };
}

// ─── OAuth Device Flow ───

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/** Step 1: Request a device code */
export async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch(proxied(GITHUB_DEVICE_CODE_URL), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: 'repo read:user',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (!getStoredCorsProxy()) {
      throw new Error('CORS blocked. GitHub login/device endpoints require a CORS proxy for browser apps. Set a proxy URL in the GitHub settings.');
    }
    throw new Error(`Failed to request device code: ${res.status} ${text}`);
  }
  return res.json();
}

/** Step 2: Poll for the access token */
export async function pollForToken(
  clientId: string,
  deviceCode: string,
  onPoll?: () => void
): Promise<string> {
  const maxAttempts = 60; // 5 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    onPoll?.();

    const res = await fetch(proxied(GITHUB_TOKEN_URL), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      // Fetch user info and store
      const user = await loginWithPAT(data.access_token);
      return user.login;
    }

    if (data.error === 'authorization_pending') {
      continue; // User hasn't completed auth yet
    }

    if (data.error === 'slow_down') {
      // Back off
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }

    throw new Error(data.error_description || data.error || 'Unknown error');
  }

  throw new Error('Polling timed out. Please try again.');
}

/** Disconnect — clear stored auth */
export function logout(): void {
  storeAuth(null, null);
}
