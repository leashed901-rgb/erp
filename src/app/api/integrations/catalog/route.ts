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
  loginType?: string | null;
  setupInstructions?: string[];
  setupLink?: string | null;
  appModules?: string | null;
  whatItDoes?: string | null;
  canCreate?: string | null;
  canRead?: string | null;
  canDelete?: string | null;
  eventsInstant?: string | null;
  eventsPolled?: string | null;
  actionsCount?: number | null;
  triggersCount?: number | null;
  integrationPoints?: unknown;
  activepiecesMatch?: string | null;
  importsData?: string[] | null;
  connect?: {
    authMode: string;
    credentialFields?: ConnectFieldShape[];
    connectionFields?: ConnectFieldShape[];
    authorizationUrl?: string | null;
  } | null;
}

export async function GET() {
  const sb = supabaseAdmin();
  // The library outgrew one PostgREST page when the full Nango import
  // landed (1,800+ rows): an unpaginated select silently truncated at
  // 1,000 and alphabetically-late apps (Resend, Shopify) vanished from
  // the catalog. Page through the whole table.
  const providerRows: { code: string; name: string; category: string; docs_url: string | null; api_base_url: string | null; notes: unknown }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const page = await sb
        .from('integration_providers')
        .select('code, name, category, docs_url, api_base_url, notes')
        .eq('is_enabled', true)
        .order('name')
        .order('code')
        .range(from, from + PAGE - 1);
      if (page.error) {
        return NextResponse.json(
          { error: { code: 'CATALOG_READ_FAILED', message: page.error.message } },
          { status: 500 },
        );
      }
      providerRows.push(...((page.data || []) as typeof providerRows));
      if (!page.data || page.data.length < PAGE) break;
    }
  }
  const connectionsRes = await sb
    .from('integration_connections')
    .select('provider_code, status, display_name, config')
    .eq('tenant_id', DEFAULT_TENANT_ID);

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
    loginType: string | null;
    setupInstructions: string[];
    setupLink: string | null;
    appModules: string[];
    whatItDoes: string | null;
    canCreate: string | null;
    canRead: string | null;
    canDelete: string | null;
    eventsInstant: string | null;
    eventsPolled: string | null;
    actionsCount: number | null;
    triggersCount: number | null;
    integrationPoints: unknown[];
    activepiecesMatch: string | null;
    importsData: string[];
  }[] = [];
  for (const p of providerRows) {
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
      // Login type + setup instructions come from the Activepieces
      // piece definition; the setup link is the matched Nango
      // provider's setup guide (reference only).
      loginType: notes.loginType || null,
      setupInstructions: notes.setupInstructions || [],
      setupLink: notes.setupLink || null,
      // Where this integration works in the app — the placement from
      // the connector master list; the catalog is organized by it.
      appModules: (notes.appModules || '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      // The explanation layer from the connector master list: what
      // the company does, what the connector can do, the events it
      // reports, and every action/trigger it exposes.
      whatItDoes: notes.whatItDoes || null,
      canCreate: notes.canCreate || null,
      canRead: notes.canRead || null,
      canDelete: notes.canDelete || null,
      eventsInstant: notes.eventsInstant || null,
      eventsPolled: notes.eventsPolled || null,
      actionsCount: notes.actionsCount ?? null,
      triggersCount: notes.triggersCount ?? null,
      integrationPoints: Array.isArray(notes.integrationPoints) ? notes.integrationPoints : [],
      activepiecesMatch: notes.activepiecesMatch || null,
      // The app's import contract: the data types it brings into the
      // platform, from its inbound points (pulls, syncs, event pushes).
      importsData: [
        ...new Set(
          (Array.isArray(notes.integrationPoints) ? notes.integrationPoints : [])
            .filter((pt: { direction?: string }) => {
              const dir = String(pt.direction || '');
              return !dir.includes('app ->') && !dir.includes('Your app ->');
            })
            .map((pt: { dataType?: string }) => pt.dataType)
            .filter(Boolean),
        ),
      ] as string[],
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
