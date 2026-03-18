// ─── ARM API Introspection ───
// Fetches resource type metadata and schemas from Azure Resource Manager APIs.
// No hardcoded schemas — everything is discovered at runtime.

import { trackedFetch } from '@sabbour/adaptive-ui-core';

const schemaCache = new Map<string, ArmResourceSchema>();

export interface ArmProperty {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  description?: string;
  required?: boolean;
  enumValues?: string[];
  default?: string;
  readOnly?: boolean;
}

export interface ArmResourceSchema {
  resourceType: string;
  apiVersion: string;
  properties: ArmProperty[];
  fetchedAt: number;
}

export interface AzureRegion {
  name: string;
  displayName: string;
  paired?: string;
}

export interface AzureSku {
  name: string;
  tier?: string;
  size?: string;
  family?: string;
  capacity?: number;
}

// ─── Fetch available Azure regions ───

export async function fetchRegions(
  token: string,
  subscriptionId: string
): Promise<AzureRegion[]> {
  const res = await trackedFetch(
    `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch regions: ${res.status}`);
  const data = await res.json();
  return (data.value ?? [])
    .filter((loc: any) => loc.metadata?.regionType === 'Physical')
    .map((loc: any) => ({
      name: loc.name,
      displayName: loc.displayName,
      paired: loc.metadata?.pairedRegion?.[0]?.name,
    }));
}

// ─── Fetch resource groups ───

export async function fetchResourceGroups(
  token: string,
  subscriptionId: string
): Promise<Array<{ name: string; location: string }>> {
  const res = await trackedFetch(
    `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2022-09-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch resource groups: ${res.status}`);
  const data = await res.json();
  return (data.value ?? []).map((rg: any) => ({
    name: rg.name,
    location: rg.location,
  }));
}

// ─── Fetch subscriptions ───

export async function fetchSubscriptions(
  token: string
): Promise<Array<{ id: string; displayName: string; state: string }>> {
  const res = await trackedFetch(
    'https://management.azure.com/subscriptions?api-version=2022-12-01',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch subscriptions: ${res.status}`);
  const data = await res.json();
  return (data.value ?? []).map((sub: any) => ({
    id: sub.subscriptionId,
    displayName: sub.displayName,
    state: sub.state,
  }));
}

// ─── Fetch available SKUs for a resource provider ───

export async function fetchSkus(
  token: string,
  subscriptionId: string,
  provider: string,
  location?: string
): Promise<AzureSku[]> {
  // Try the generic SKUs endpoint first
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/${provider}/skus?api-version=2021-04-01`;
  const res = await trackedFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const skus: AzureSku[] = (data.value ?? []).map((s: any) => ({
    name: s.name ?? s.sku?.name,
    tier: s.tier ?? s.sku?.tier,
    size: s.size ?? s.sku?.size,
    family: s.family ?? s.sku?.family,
    capacity: s.capacity,
  }));

  if (location) {
    return skus.filter((s) =>
      !data.value?.find((v: any) =>
        v.name === s.name &&
        v.locations &&
        !v.locations.some((l: string) => l.toLowerCase() === location.toLowerCase())
      )
    );
  }
  return skus;
}

// ─── Discover resource type schema from provider metadata ───

export async function fetchResourceTypeSchema(
  token: string,
  resourceType: string
): Promise<ArmResourceSchema | null> {
  // Check cache (5 min TTL)
  const cached = schemaCache.get(resourceType);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return cached;
  }

  const parts = resourceType.split('/');
  if (parts.length < 2) return null;
  const namespace = parts[0];
  const typeName = parts.slice(1).join('/');

  try {
    // Fetch provider metadata
    const res = await trackedFetch(
      `https://management.azure.com/providers/${namespace}?api-version=2021-04-01`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const provider = await res.json();

    // Find the resource type definition
    const rtDef = provider.resourceTypes?.find(
      (rt: any) => rt.resourceType.toLowerCase() === typeName.toLowerCase()
    );
    if (!rtDef) return null;

    const apiVersion = rtDef.apiVersions?.[0];
    if (!apiVersion) return null;

    // Now fetch a sample PUT schema by doing a GET on the resource type template
    // We use the provider's resource type properties
    const properties = extractPropertiesFromProvider(rtDef, provider);

    const schema: ArmResourceSchema = {
      resourceType,
      apiVersion,
      properties,
      fetchedAt: Date.now(),
    };

    schemaCache.set(resourceType, schema);
    return schema;
  } catch {
    return null;
  }
}

// ─── Discover all resource types for a provider ───

export async function fetchProviderResourceTypes(
  token: string,
  namespace: string
): Promise<Array<{ resourceType: string; apiVersions: string[] }>> {
  const res = await trackedFetch(
    `https://management.azure.com/providers/${namespace}?api-version=2021-04-01`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.resourceTypes ?? []).map((rt: any) => ({
    resourceType: `${namespace}/${rt.resourceType}`,
    apiVersions: rt.apiVersions ?? [],
  }));
}

// ─── Extract properties from ARM provider metadata ───
// ARM provider metadata contains property info in the resource type definitions.
// We parse what's available and present it as form fields.

function extractPropertiesFromProvider(rtDef: any, _provider: any): ArmProperty[] {
  const properties: ArmProperty[] = [];

  // Standard ARM resource properties that apply to all resources
  properties.push(
    { name: 'name', type: 'string', description: 'Resource name', required: true },
    { name: 'location', type: 'string', description: 'Azure region', required: true },
  );

  // Extract from the resource type's properties if available
  if (rtDef.properties) {
    for (const [key, val] of Object.entries(rtDef.properties as Record<string, any>)) {
      if (key.startsWith('x-') || key === 'apiVersions') continue;
      const prop: ArmProperty = {
        name: key,
        type: inferType(val),
        description: val?.description ?? key,
      };
      if (val?.enum) {
        prop.type = 'enum';
        prop.enumValues = val.enum;
      }
      if (val?.readOnly) prop.readOnly = true;
      if (!prop.readOnly) {
        properties.push(prop);
      }
    }
  }

  // If we got capabilities, add them as enum properties
  if (rtDef.capabilities) {
    const caps = typeof rtDef.capabilities === 'string'
      ? rtDef.capabilities.split(',').map((c: string) => c.trim())
      : [];
    if (caps.length > 0) {
      properties.push({
        name: 'capabilities',
        type: 'enum',
        description: 'Resource capabilities',
        enumValues: caps,
      });
    }
  }

  return properties;
}

function inferType(val: any): ArmProperty['type'] {
  if (!val) return 'string';
  if (val.type === 'integer' || val.type === 'number') return 'number';
  if (val.type === 'boolean') return 'boolean';
  if (val.type === 'array') return 'array';
  if (val.type === 'object') return 'object';
  if (val.enum) return 'enum';
  return 'string';
}

// ─── Clear cache ───

export function clearSchemaCache(): void {
  schemaCache.clear();
}
