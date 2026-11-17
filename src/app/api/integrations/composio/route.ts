import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  COMPOSIO_CATALOG,
  ComposioNotConfiguredError,
  syncComposioConnections,
} from '@/lib/composio';

/**
 * Composio connection layer for Settings → Integrations.
 *
 * GET  — the workday catalog merged with the tenant's mirrored connection
 *        state (integration_connections). Read-only: no Composio call, so
 *        a page load never initiates anything.
 * POST {action:'connect', toolkit} — ask Composio for the hosted connect
 *        link for that toolkit and mirror the pending connection. The
 *        tenant opens the link and enters THEIR OWN provider key there;
 *        no credential ever passes through this app.
 * POST {action:'sync'} — refresh the mirror from Composio for the whole
 *        catalog (initiates pending links for unconnected toolkits, so
 *        this is an explicit operator action, not a page load).
 */

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: rows, error } = await sb
    .from('integration_connections')
    .select('id, provider_code, display_name, status, external_account_id, config, updated_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('provider_code');
  if (error) return fail('INTERNAL', error.message, 500);

  const composioRows = (rows || []).filter(
    (r) => (r.config as Record<string, unknown>)?.source === 'composio',
  );
  const byProvider = new Map<string, typeof composioRows>();
  for (const r of composioRows) {
    const list = byProvider.get(r.provider_code) || [];
    list.push(r);
    byProvider.set(r.provider_code, list);
  }

  const catalog = COMPOSIO_CATALOG.map((entry) => {
    const conns = byProvider.get(entry.slug) || [];
    const best = conns.find((c) => c.status === 'active') || conns[0];
    return {
      ...entry,
      connectionStatus: best?.status || 'not_connected',
      externalAccountId: best?.external_account_id || null,
      updatedAt: best?.updated_at || null,
    };
  });

  return NextResponse.json({
    data: {
      catalog,
      nativeConnections: (rows || []).filter(
        (r) => (r.config as Record<string, unknown>)?.source !== 'composio',
      ),
    },
    meta: { configured: Boolean(process.env.COMPOSIO_API_KEY?.trim()) },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;
  try {
    if (action === 'connect') {
      const requested = String(body.toolkit || '');
      // The catalog page sends Activepieces-style slugs (google-calendar)
      // while Composio spells some toolkits differently (googlecalendar) —
      // resolve by normalized name so both spellings connect.
      const normSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const entry = COMPOSIO_CATALOG.find((e) => normSlug(e.slug) === normSlug(requested));
      if (!entry) return fail('VALIDATION', `Unknown toolkit '${requested}'.`, 400);
      const toolkit = entry.slug;
      if (toolkit === 'shopify') {
        return fail(
          'VALIDATION',
          'Shopify connects from the Channels screen — its sign-in needs your store domain first.',
          400,
        );
      }
      const [conn] = await syncComposioConnections([toolkit]);
      if (!conn || conn.status === 'failed') {
        return fail('COMPOSIO_FAILED', `Composio could not start a ${entry.name} connection.`, 502);
      }
      return NextResponse.json({
        data: { toolkit, status: conn.status, redirectUrl: conn.redirectUrl || null },
      });
    }
    if (action === 'sync') {
      const toolkits = COMPOSIO_CATALOG.map((e) => e.slug).filter((s) => s !== 'shopify');
      const results = await syncComposioConnections(toolkits);
      return NextResponse.json({
        data: {
          synced: results.map((r) => ({ toolkit: r.toolkit, status: r.status })),
        },
      });
    }
    return fail('VALIDATION', `Unknown action '${action}'.`, 400);
  } catch (e) {
    if (e instanceof ComposioNotConfiguredError) {
      return fail('COMPOSIO_NOT_CONFIGURED', e.message, 502);
    }
    return fail('INTERNAL', e instanceof Error ? e.message : 'Composio request failed.', 500);
  }
}
