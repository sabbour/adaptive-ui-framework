import { PublicClientApplication, type AuthenticationResult, type INetworkModule, type NetworkRequestOptions, type NetworkResponse } from '@azure/msal-browser';

// ─── Entra ID Authentication for Azure AI Foundry ───
// Uses MSAL.js to authenticate via popup and get an access token
// for Azure Cognitive Services / Azure AI Foundry endpoints.
// Uses the well-known Azure CLI client ID by default.

const DEFAULT_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/common';
const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

// Custom network client that rewrites login.microsoftonline.com requests
// to go through the Vite dev-server proxy, bypassing CORS.
const proxyNetworkClient: INetworkModule = {
  sendGetRequestAsync: async <T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> => {
    const proxiedUrl = rewriteUrl(url);
    const response = await fetch(proxiedUrl, {
      method: 'GET',
      headers: options?.headers as Record<string, string>,
    });
    return { headers: Object.fromEntries(response.headers.entries()), body: await response.json() as T, status: response.status };
  },
  sendPostRequestAsync: async <T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> => {
    const proxiedUrl = rewriteUrl(url);
    const response = await fetch(proxiedUrl, {
      method: 'POST',
      headers: options?.headers as Record<string, string>,
      body: options?.body,
    });
    return { headers: Object.fromEntries(response.headers.entries()), body: await response.json() as T, status: response.status };
  },
};

function rewriteUrl(url: string): string {
  const AAD_HOST = 'https://login.microsoftonline.com';
  if (url.startsWith(AAD_HOST)) {
    return '/api/auth-proxy' + url.slice(AAD_HOST.length);
  }
  return url;
}

let msalInstance: PublicClientApplication | null = null;

function getMsal(clientId?: string, tenantId?: string): PublicClientApplication {
  if (msalInstance) return msalInstance;

  const authority = tenantId
    ? `https://login.microsoftonline.com/${tenantId}`
    : DEFAULT_AUTHORITY;

  msalInstance = new PublicClientApplication({
    auth: {
      clientId: clientId ?? DEFAULT_CLIENT_ID,
      authority,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
    system: {
      networkClient: proxyNetworkClient,
    },
  });

  return msalInstance;
}

export interface EntraAuthResult {
  accessToken: string;
  account: {
    name: string;
    username: string;
    tenantId: string;
  };
  expiresOn: Date;
}

/** Sign in via popup and get a Cognitive Services access token */
export async function entraLogin(
  clientId?: string,
  tenantId?: string
): Promise<EntraAuthResult> {
  const msal = getMsal(clientId, tenantId);
  await msal.initialize();

  let result: AuthenticationResult;

  // Try silent first (cached token)
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    try {
      result = await msal.acquireTokenSilent({
        scopes: [COGNITIVE_SERVICES_SCOPE],
        account: accounts[0],
      });
      return mapResult(result);
    } catch {
      // Silent failed, fall through to popup
    }
  }

  // Interactive popup
  result = await msal.acquireTokenPopup({
    scopes: [COGNITIVE_SERVICES_SCOPE],
  });

  return mapResult(result);
}

/** Acquire a fresh access token silently (for use before each LLM call).
 *  Falls back to popup if silent acquisition fails. */
export async function entraGetAccessToken(): Promise<string> {
  if (!msalInstance) {
    throw new Error('Not signed in. Call entraLogin() first.');
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No Entra ID account found. Please sign in again.');
  }

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: [COGNITIVE_SERVICES_SCOPE],
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    // Silent failed — try popup (token may have expired beyond refresh window)
    const result = await msalInstance.acquireTokenPopup({
      scopes: [COGNITIVE_SERVICES_SCOPE],
    });
    return result.accessToken;
  }
}

/** Sign out */
export async function entraLogout(): Promise<void> {
  if (!msalInstance) return;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    await msalInstance.logoutPopup({ account: accounts[0] });
  }
  msalInstance = null;
}

/** Check if already signed in (has cached account) */
export async function entraGetActiveAccount(): Promise<EntraAuthResult | null> {
  const msal = getMsal();
  await msal.initialize();

  const accounts = msal.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const result = await msal.acquireTokenSilent({
      scopes: [COGNITIVE_SERVICES_SCOPE],
      account: accounts[0],
    });
    return mapResult(result);
  } catch {
    return null;
  }
}

function mapResult(result: AuthenticationResult): EntraAuthResult {
  return {
    accessToken: result.accessToken,
    account: {
      name: result.account?.name ?? '',
      username: result.account?.username ?? '',
      tenantId: result.account?.tenantId ?? '',
    },
    expiresOn: result.expiresOn ?? new Date(),
  };
}
