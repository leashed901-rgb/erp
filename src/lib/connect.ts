import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';

/**
 * Our own connection layer. The connect configs come from Nango's
 * provider library (auth mode, credential fields, API base, auth
 * header templates, verification endpoints), stored per provider in
 * integration_providers.notes.connect. A tenant connects with THEIR
 * OWN credentials: API keys and OAuth tokens are verified against the
 * provider's real API before a connection is marked active, and the
 * credentials live in the tenant's integration_keys vault — never in
 * a third-party connection service.
 */

export interface ConnectField {
  name: string;
  title: string;
  secret?: boolean;
  required?: boolean;
  description?: string | null;
}

export interface ConnectConfig {
  authMode: string;
  baseUrl: string | null;
  headers: Record<string, string>;
  verify: { method: string; endpoint: string; headers?: Record<string, string> } | null;
  credentialFields: ConnectField[];
  connectionFields: ConnectField[];
  authorizationUrl: string | null;
  tokenUrl: string | null;
  scopes?: string[];
  source: string;
}

export interface ProviderRow {
  code: string;
  name: string;
  notes: Record<string, unknown>;
  connect: ConnectConfig | null;
}

export async function getProvider(code: string): Promise<ProviderRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_providers')
    .select('code, name, notes')
    .eq('code', code)
    .maybeSingle();
  if (!data) return null;
  let notes: Record<string, unknown> = {};
  try {
    notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : (data.notes || {});
  } catch {
    notes = {};
  }
  return {
    code: data.code as string,
    name: data.name as string,
    notes,
    connect: (notes.connect as ConnectConfig) || null,
  };
}

/** Replace ${apiKey}, ${credentials.x}, ${connectionConfig.x}, ${accessToken}. */
export function substitute(
  template: string,
  ctx: {
    credentials: Record<string, string>;
    connectionConfig: Record<string, string>;
    accessToken?: string;
  },
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_m, expr: string) => {
    const path = expr.trim().split('.');
    if (path[0] === 'credentials') return ctx.credentials[path[1]] ?? '';
    if (path[0] === 'connectionConfig') return ctx.connectionConfig[path[1]] ?? '';
    if (path[0] === 'accessToken') return ctx.accessToken ?? '';
    if (path.length === 1) return ctx.credentials[path[0]] ?? ctx.connectionConfig[path[0]] ?? '';
    return '';
  });
}

export function buildAuthHeaders(
  cfg: ConnectConfig,
  credentials: Record<string, string>,
  connectionConfig: Record<string, string>,
  accessToken?: string,
): Record<string, string> {
  const ctx = { credentials, connectionConfig, accessToken };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.headers || {})) {
    headers[k.toLowerCase()] = substitute(v, ctx);
  }
  if (accessToken && !headers['authorization']) {
    headers['authorization'] = `Bearer ${accessToken}`;
  }
  if (cfg.authMode === 'BASIC' && !headers['authorization']) {
    const user = credentials['username'] || '';
    const pass = credentials['password'] || '';
    headers['authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }
  return headers;
}

export interface VerifyResult {
  ok: boolean;
  mode: 'endpoint' | 'probe';
  status: number;
  detail: string;
}

/** Call the provider's real API with the supplied credentials. A
 *  connection only turns active when the provider itself accepts them. */
export async function verifyCredentials(
  cfg: ConnectConfig,
  credentials: Record<string, string>,
  connectionConfig: Record<string, string>,
  accessToken?: string,
): Promise<VerifyResult> {
  const ctx = { credentials, connectionConfig, accessToken };
  const base = cfg.baseUrl ? substitute(cfg.baseUrl, ctx).replace(/\/$/, '') : '';
  if (!base) return { ok: false, mode: 'probe', status: 0, detail: 'Config has no API base URL.' };
  const headers = buildAuthHeaders(cfg, credentials, connectionConfig, accessToken);
  if (cfg.verify?.endpoint) {
    const url = `${base}${substitute(cfg.verify.endpoint, ctx)}`;
    const res = await fetch(url, {
      method: cfg.verify.method || 'GET',
      headers: { ...headers, ...(cfg.verify.headers || {}) },
    }).catch(() => null);
    if (!res) return { ok: false, mode: 'endpoint', status: 0, detail: 'Provider did not answer.' };
    const text = await res.text().catch(() => '');
    return {
      ok: res.ok,
      mode: 'endpoint',
      status: res.status,
      detail: res.ok ? 'Provider accepted the credentials.' : text.slice(0, 240),
    };
  }
  // No verification endpoint in the config: probe the API base — a
  // 401/403 means the credentials were rejected; anything else means
  // the server accepted them at the edge.
  const res = await fetch(base, { method: 'GET', headers }).catch(() => null);
  if (!res) return { ok: false, mode: 'probe', status: 0, detail: 'Provider did not answer.' };
  const rejected = res.status === 401 || res.status === 403;
  return {
    ok: !rejected,
    mode: 'probe',
    status: res.status,
    detail: rejected ? 'Provider rejected the credentials.' : 'Provider answered (no verification endpoint in config).',
  };
}

const keyNameFor = (code: string, kind: 'CREDENTIALS' | 'OAUTH' | 'OAUTH_APP') =>
  `${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${kind}`;

export async function saveTenantSecret(
  code: string,
  kind: 'CREDENTIALS' | 'OAUTH' | 'OAUTH_APP',
  value: Record<string, unknown>,
): Promise<void> {
  const sb = supabaseAdmin();
  const keyName = keyNameFor(code, kind);
  const { data: existing } = await sb
    .from('integration_keys')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('key_name', keyName)
    .maybeSingle();
  if (existing) {
    await sb
      .from('integration_keys')
      .update({ encrypted_value: JSON.stringify(value) })
      .eq('id', existing.id);
  } else {
    await sb.from('integration_keys').insert({
      tenant_id: DEFAULT_TENANT_ID,
      key_name: keyName,
      encrypted_value: JSON.stringify(value),
    });
  }
}

export async function readTenantSecret(
  code: string,
  kind: 'CREDENTIALS' | 'OAUTH' | 'OAUTH_APP',
): Promise<Record<string, unknown> | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_keys')
    .select('encrypted_value')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('key_name', keyNameFor(code, kind))
    .maybeSingle();
  if (!data?.encrypted_value) return null;
  try {
    return JSON.parse(data.encrypted_value as string);
  } catch {
    return { value: data.encrypted_value as string };
  }
}

export async function markConnection(
  provider: ProviderRow,
  status: 'active' | 'error',
  extra: { detail?: string; scopes?: string[]; externalAccountId?: string } = {},
): Promise<void> {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from('integration_connections')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider.code)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    provider_code: provider.code,
    display_name: provider.name,
    status,
    status_reason: extra.detail || null,
    scopes: extra.scopes || [],
    external_account_id: extra.externalAccountId || null,
    config: { source: 'native-connect', auth_mode: provider.connect?.authMode || null },
  };
  if (status === 'active') {
    row.connected_at = now;
    row.last_success_at = now;
    row.last_error = null;
  } else {
    row.last_error_at = now;
    row.last_error = extra.detail || 'Verification failed';
  }
  if (existing) await sb.from('integration_connections').update(row).eq('id', existing.id);
  else await sb.from('integration_connections').insert(row);
}

/** OAuth app credentials for a provider: the tenant's own registered
 *  app first, then the platform app from env (e.g. PRINTFUL_CLIENT_ID). */
export async function getOAuthApp(
  code: string,
): Promise<{ clientId: string; clientSecret: string; owner: 'tenant' | 'platform' } | null> {
  const tenantApp = await readTenantSecret(code, 'OAUTH_APP');
  if (tenantApp?.client_id && tenantApp?.client_secret) {
    return {
      clientId: String(tenantApp.client_id),
      clientSecret: String(tenantApp.client_secret),
      owner: 'tenant',
    };
  }
  const envPrefix = code.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  const clientSecret =
    process.env[`${envPrefix}_CLIENT_SECRET`] || process.env[`${envPrefix}_SECERET_KEY`];
  if (clientId && clientSecret) return { clientId, clientSecret, owner: 'platform' };
  return null;
}
