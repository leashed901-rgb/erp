import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * The integration catalog: every provider in the platform's library,
 * classified by capability and tier, with this tenant's live connection
 * status merged in. The library is forked from Activepieces' MIT
 * community pieces (748), enriched with auth configs referenced from
 * Nango's provider library. A provider is "connectable" when a connect
 * config exists for it — those are the apps the Integrations page
 * offers, each with a working connect flow against the provider's own
 * API. Everything else stays in the library until its config lands.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface ConnectFieldShape {
  name: string;
  title: string;
  secret?: boolean;
  required?: boolean;
  description?: string | null;
}

interface ProviderNotes {
  capability?: string;
  tier?: number;
  auth_mode?: string | null;
  icon?: string | null;
  source?: string;
  nango?: string | null;
  connect?: {
    authMode: string;
    credentialFields?: ConnectFieldShape[];
    connectionFields?: ConnectFieldShape[];
    authorizationUrl?: string | null;
  } | null;
}

export async function GET() {
  const sb = supabaseAdmin();
  const [providersRes, connectionsRes] = await Promise.all([
    sb
      .from('integration_providers')
      .select('code, name, category, docs_url, api_base_url, notes')
      .eq('is_enabled', true)
      .order('name'),
    sb
      .from('integration_connections')
      .select('provider_code, status, display_name, config')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  if (providersRes.error) {
    return NextResponse.json(
      { error: { code: 'CATALOG_READ_FAILED', message: providersRes.error.message } },
      { status: 500 },
    );
  }

  const RANK: Record<string, number> = {
    active: 3, pending: 2, needs_repair: 1, error: 1, disconnected: 0, revoked: 0,
  };
  const statusByNorm = new Map<string, string>();
  for (const c of connectionsRes.data || []) {
    // Composio initiation mirrors are not connections — a 'pending'
    // row from an initiation says nothing about the tenant's state.
    // Only real connections (and any active row) count here.
    const source = (c.config as { source?: string } | null)?.source;
    if (source === 'composio' && c.status !== 'active') continue;
    const key = norm(c.provider_code as string);
    const status = c.status as string;
    const prev = statusByNorm.get(key);
    // The strongest state wins: an active connection beats a pending
    // mirror row for the same product.
    if (!prev || (RANK[status] ?? 0) > (RANK[prev] ?? 0)) statusByNorm.set(key, status);
  }

  const seen = new Set<string>();
  const providers: {
    code: string;
    name: string;
    capability: string;
    tier: number;
    authMode: string | null;
    icon: string | null;
    source: string;
    docsUrl: string | null;
    status: string;
    connectVia: string;
    connectable: boolean;
    credentialFields: ConnectFieldShape[];
    connectionFields: ConnectFieldShape[];
  }[] = [];
  for (const p of providersRes.data || []) {
    let notes: ProviderNotes = {};
    try {
      notes = typeof p.notes === 'string' ? JSON.parse(p.notes) : ((p.notes as ProviderNotes) || {});
    } catch {
      notes = {};
    }
    const key = norm(p.code as string);
    // The same product can exist under a platform slug and a catalog
    // slug (googlecalendar vs google-calendar) — show it once,
    // preferring the row that carries a connection.
    if (seen.has(key)) continue;
    seen.add(key);
    const status = statusByNorm.get(key) || 'not_connected';
    const connect = notes.connect || null;
    providers.push({
      code: p.code,
      name: p.name,
      capability: notes.capability || 'Other',
      tier: notes.tier || 3,
      authMode: connect?.authMode || notes.auth_mode || null,
      icon: notes.icon || null,
      source: notes.source || 'native',
      docsUrl: p.docs_url,
      status,
      // How this app connects TODAY: our own flow when a connect config
      // exists; Channels for Shopify; generated actions for Printful.
      connectVia: connect
        ? 'native'
        : p.code === 'shopify'
          ? 'channels'
          : notes.source === 'generated-openapi'
            ? 'generated'
            : 'catalog',
      connectable: Boolean(connect) || status === 'active',
      credentialFields: connect?.credentialFields || [],
      connectionFields: connect?.connectionFields || [],
    });
  }
  providers.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  const capabilities = new Map<string, number>();
  for (const p of providers) capabilities.set(p.capability, (capabilities.get(p.capability) || 0) + 1);

  return NextResponse.json({
    data: {
      providers,
      total: providers.length,
      connectable: providers.filter((p) => p.connectable).length,
      connected: providers.filter((p) => p.status === 'active').length,
      capabilities: [...capabilities.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      tiers: [1, 2, 3].map((tier) => ({
        tier,
        count: providers.filter((p) => p.tier === tier).length,
      })),
    },
  });
}
