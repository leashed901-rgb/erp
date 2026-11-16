import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * Composio connection layer (Kim's direction, 2026-11-15).
 *
 * Tenants connect their OWN provider accounts — their Resend, their
 * Printify, their Google, their Microsoft — through Composio. Credentials
 * live in Composio's vault, never in our database. This module talks to
 * Composio's MCP endpoint (COMPOSIO_SERVER_URL, default
 * https://connect.composio.dev/mcp) with the consumer key
 * (COMPOSIO_API_KEY, sent as the x-consumer-api-key header) and mirrors
 * connection state into integration_connections, the single source of
 * truth every screen reads.
 *
 * Printful is NOT in Composio's catalog today (searching Printful work
 * returns Printify tools) — it stays on its native supplier path.
 * Shopify IS in the catalog but cannot initiate blind: its OAuth flow
 * needs the store domain first, which the Channels connect form collects.
 */

export class ComposioNotConfiguredError extends Error {
  constructor() {
    super('COMPOSIO_API_KEY is not configured — add the Composio consumer key to the app env. Integrations stay read-only until then.');
    this.name = 'ComposioNotConfiguredError';
  }
}

function composioConfig(): { url: string; key: string } {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) throw new ComposioNotConfiguredError();
  const url = process.env.COMPOSIO_SERVER_URL?.trim() || 'https://connect.composio.dev/mcp';
  return { url, key };
}

interface ComposioToolResult {
  successful: boolean;
  data: Record<string, unknown>;
  error?: string | null;
}

/** One tools/call against the Composio MCP endpoint, SSE unwrapped. */
async function composioCall(tool: string, args: Record<string, unknown>): Promise<ComposioToolResult> {
  const { url, key } = composioConfig();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-consumer-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now() % 100000,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`Composio answered ${res.status}`);
  const text = await res.text();
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = JSON.parse(line.slice(5)) as {
      result?: { content?: { text?: string }[]; isError?: boolean };
      error?: { message?: string };
    };
    if (payload.error) throw new Error(`Composio error: ${payload.error.message || 'unknown'}`);
    const inner = payload.result?.content?.[0]?.text;
    if (!inner) continue;
    const parsed = JSON.parse(inner) as ComposioToolResult;
    if (payload.result?.isError && !parsed.error) parsed.error = inner.slice(0, 300);
    return parsed;
  }
  throw new Error('Composio returned no result');
}

export interface ToolkitConnection {
  toolkit: string;
  /** Composio-side status: initiated | active | failed | … */
  status: string;
  redirectUrl?: string;
  accounts: { id: string; status: string }[];
}

/**
 * Ask Composio about connections for the given toolkits. NOTE: for a
 * toolkit with no connection yet, this INITIATES one and returns the
 * hosted connect link — it is a connect action, not a pure read. Only
 * call it from connect/sync paths, never from a plain page load.
 */
export async function composioManageConnections(toolkits: string[]): Promise<ToolkitConnection[]> {
  const out = await composioCall('COMPOSIO_MANAGE_CONNECTIONS', { action: 'list', toolkits });
  const results = (out.data?.results || {}) as Record<string, {
    status?: string;
    redirect_url?: string;
    accounts?: { id: string; status: string }[];
  }>;
  return toolkits.map((toolkit) => {
    const r = results[toolkit] || {};
    return {
      toolkit,
      status: r.status || 'failed',
      redirectUrl: r.redirect_url,
      accounts: r.accounts || [],
    };
  });
}

export interface CatalogEntry {
  slug: string;
  name: string;
  /** Display grouping for the picker. */
  category: string;
  /** integration_providers.category CHECK vocab:
   *  banking|email|ai|payments|commerce_channel|tax|efile|payroll|
   *  shipping|social|ads|storage|other */
  providerCategory: string;
}

/** The workday catalog we surface in Settings → Integrations. Slugs are
 *  Composio toolkit ids; sync reports any slug Composio doesn't resolve. */
export const COMPOSIO_CATALOG: CatalogEntry[] = [
  { slug: 'resend', name: 'Resend', category: 'Email sending', providerCategory: 'email' },
  { slug: 'brevo', name: 'Brevo', category: 'Email sending', providerCategory: 'email' },
  { slug: 'gmail', name: 'Gmail', category: 'Mail & calendar', providerCategory: 'email' },
  { slug: 'googlecalendar', name: 'Google Calendar', category: 'Mail & calendar', providerCategory: 'other' },
  { slug: 'outlook', name: 'Outlook', category: 'Mail & calendar', providerCategory: 'email' },
  // No umbrella Microsoft 365 / OneDrive / SharePoint toolkit initiates
  // blind (verified 2026-11-15: microsoft_365, microsoft365, onedrive,
  // sharepoint, microsoft_excel all fail) — they likely need the tenant's
  // own Azure OAuth app. Microsoft coverage today = Outlook + Teams;
  // the files side is a Phase 1 item.
  { slug: 'googledrive', name: 'Google Drive', category: 'Files & docs', providerCategory: 'storage' },
  { slug: 'googlesheets', name: 'Google Sheets', category: 'Files & docs', providerCategory: 'storage' },
  { slug: 'notion', name: 'Notion', category: 'Files & docs', providerCategory: 'storage' },
  { slug: 'airtable', name: 'Airtable', category: 'Files & docs', providerCategory: 'storage' },
  { slug: 'slack', name: 'Slack', category: 'Chat', providerCategory: 'other' },
  { slug: 'microsoft_teams', name: 'Microsoft Teams', category: 'Chat', providerCategory: 'other' },
  { slug: 'twilio', name: 'Twilio', category: 'Telephony & SMS', providerCategory: 'other' },
  { slug: 'plivo', name: 'Plivo', category: 'Telephony & SMS', providerCategory: 'other' },
  { slug: 'zoom', name: 'Zoom', category: 'Meetings & support calls', providerCategory: 'other' },
  { slug: 'stripe', name: 'Stripe', category: 'Money', providerCategory: 'payments' },
  { slug: 'shopify', name: 'Shopify', category: 'Storefronts & channels', providerCategory: 'commerce_channel' },
  { slug: 'printify', name: 'Printify', category: 'Suppliers & print on demand', providerCategory: 'commerce_channel' },
  { slug: 'instagram', name: 'Instagram', category: 'Social', providerCategory: 'social' },
  { slug: 'facebook', name: 'Facebook', category: 'Social', providerCategory: 'social' },
  { slug: 'linkedin', name: 'LinkedIn', category: 'Social', providerCategory: 'social' },
  { slug: 'hubspot', name: 'HubSpot', category: 'Support & CRM sync', providerCategory: 'other' },
  { slug: 'zendesk', name: 'Zendesk', category: 'Support & CRM sync', providerCategory: 'other' },
  { slug: 'quickbooks', name: 'QuickBooks', category: 'Accounting sync', providerCategory: 'other' },
];

/** integration_connections.status vocab: pending|active|needs_repair|disconnected|revoked|error */
function mapStatus(composioStatus: string): string {
  switch (composioStatus) {
    case 'active': return 'active';
    case 'initiated': return 'pending';
    case 'expired': return 'needs_repair';
    case 'failed': return 'error';
    default: return 'pending';
  }
}

/**
 * Mirror Composio connection state into integration_providers +
 * integration_connections for the tenant. Returns the per-toolkit result.
 */
export async function syncComposioConnections(toolkits: string[]): Promise<ToolkitConnection[]> {
  const connections = await composioManageConnections(toolkits);
  const sb = supabaseAdmin();
  const bySlug = new Map(COMPOSIO_CATALOG.map((e) => [e.slug, e]));
  const writeErrors: string[] = [];

  for (const entry of COMPOSIO_CATALOG) {
    if (!toolkits.includes(entry.slug)) continue;
    const { error } = await sb.from('integration_providers').upsert(
      { code: entry.slug, name: entry.name, category: entry.providerCategory, is_enabled: true },
      { onConflict: 'code' },
    );
    if (error) writeErrors.push(`provider ${entry.slug}: ${error.message}`);
  }

  for (const conn of connections) {
    const entry = bySlug.get(conn.toolkit);
    const displayName = entry?.name || conn.toolkit;
    const status = mapStatus(conn.status);
    const accounts = conn.accounts.length ? conn.accounts : [{ id: '', status: conn.status }];
    // One mirror row per provider. Every Composio initiation mints a
    // fresh account id, so matching by account id would pile up a new
    // row per sync — collapse to the freshest account (active wins) and
    // retire any older mirrored rows for the provider.
    const target = accounts.find((a) => a.status === 'active') || accounts[0];
    const externalId = target.id || null;
    const config = { source: 'composio', toolkit: conn.toolkit, composio_account_id: externalId };
    const { data: existingRows } = await sb
      .from('integration_connections')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('provider_code', conn.toolkit)
      .eq('config->>source', 'composio')
      .order('updated_at', { ascending: false });
    const keep = (existingRows || [])[0];
    if (keep?.id) {
      const { error } = await sb.from('integration_connections')
        .update({ status, display_name: displayName, external_account_id: externalId, config, updated_at: new Date().toISOString() })
        .eq('id', keep.id);
      if (error) writeErrors.push(`connection ${conn.toolkit}: ${error.message}`);
      const stale = (existingRows || []).slice(1).map((r) => r.id);
      if (stale.length) {
        const { error: delError } = await sb.from('integration_connections').delete().in('id', stale);
        if (delError) writeErrors.push(`connection ${conn.toolkit} cleanup: ${delError.message}`);
      }
    } else {
      const { error } = await sb.from('integration_connections').insert({
        tenant_id: DEFAULT_TENANT_ID,
        provider_code: conn.toolkit,
        environment: 'production',
        external_account_id: externalId,
        display_name: displayName,
        status,
        config,
      });
      if (error) writeErrors.push(`connection ${conn.toolkit}: ${error.message}`);
    }
  }
  // Never report a sync that didn't land: a silent mirror failure is how
  // the first version of this function claimed success over empty tables.
  if (writeErrors.length) {
    throw new Error(`Composio answered, but mirroring into the app failed — ${writeErrors.join('; ')}`);
  }
  return connections;
}
