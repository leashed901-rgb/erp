import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { CHANNEL_PROVIDERS } from '@/lib/channelProviders';

/**
 * GET /api/channels — every channel with its connection state
 * (integration_connections), webhook registration (commerce_webhooks),
 * published products (commerce_channel_products) and recent orders
 * (erp_orders.sales_channel). Backs the Catalog → Channels pages
 * (pack 3: channel pages on the connections domain).
 */
export async function GET() {
  const db = supabaseAdmin();
  const [channelsRes, connsRes, hooksRes, productsRes, ordersRes] = await Promise.all([
    db.from('commerce_order_channels')
      .select('id, code, name, channel_type, active, configuration')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('name', { ascending: true }),
    db.from('integration_connections')
      .select('id, provider_code, status, display_name, external_account_id, connected_at, last_success_at, last_error, config')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    db.from('commerce_webhooks')
      .select('id, channel_id, url, events, active')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    db.from('commerce_channel_products')
      .select('id, channel_id, catalog_item_id, external_product_id, external_url, published, sync_status, last_synced_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('last_synced_at', { ascending: false })
      .limit(200),
    db.from('erp_orders')
      .select('id, order_number, status, total, customer_email, created_at, sales_channel')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .not('sales_channel', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (channelsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: channelsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  const conns = new Map((connsRes.data || []).map(c => [c.provider_code, c]));
  const hooks = new Map((hooksRes.data || []).map(h => [h.channel_id, h]));
  const itemIds = [...new Set((productsRes.data || []).map(p => p.catalog_item_id).filter(Boolean))];
  const { data: items } = itemIds.length
    ? await db.from('commerce_catalog_items').select('id, name, sku').in('id', itemIds)
    : { data: [] as { id: string; name: string; sku: string | null }[] };
  const itemName = new Map((items || []).map(i => [i.id, i]));

  const channels = (channelsRes.data || []).map(ch => {
    const conn = conns.get(ch.code) || null;
    const products = (productsRes.data || [])
      .filter(p => p.channel_id === ch.id)
      .map(p => ({
        id: p.id,
        name: itemName.get(p.catalog_item_id)?.name || p.external_product_id || '—',
        sku: itemName.get(p.catalog_item_id)?.sku || null,
        externalUrl: p.external_url,
        published: p.published,
        syncStatus: p.sync_status,
        lastSyncedAt: p.last_synced_at,
      }));
    const orders = (ordersRes.data || [])
      .filter(o => o.sales_channel === ch.code)
      .slice(0, 20)
      .map(o => ({ id: o.id, number: o.order_number, status: o.status, total: o.total, email: o.customer_email, createdAt: o.created_at }));
    return {
      id: ch.id,
      code: ch.code,
      name: ch.name,
      channelType: ch.channel_type,
      active: ch.active,
      connection: conn
        ? {
            id: conn.id,
            status: conn.status,
            displayName: conn.display_name,
            externalAccountId: conn.external_account_id,
            connectedAt: conn.connected_at,
            lastSuccessAt: conn.last_success_at,
            lastError: conn.last_error,
          }
        : null,
      webhook: hooks.get(ch.id) || null,
      products,
      orders,
    };
  });

  // Providers with no channel row yet — the screen offers Connect.
  const known = new Set(channels.map(c => c.code));
  const available = Object.entries(CHANNEL_PROVIDERS)
    .filter(([code]) => !known.has(code))
    .map(([code, meta]) => ({ code, ...meta }));

  return NextResponse.json({ data: { channels, available } });
}
