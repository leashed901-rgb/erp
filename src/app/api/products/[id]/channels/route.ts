import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { findCatalogItemForProduct, resolveOrCreateCatalogItem } from '@/lib/catalogItem';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/products/[id]/channels — this product's channel listings
 * (`commerce_channel_products` joined to `commerce_order_channels`).
 * A channel with no listing row is shown as not-listed so the toggle can
 * create it; a row with published=false is listed-but-unpublished.
 * The listing key is the product's `commerce_catalog_items` row (the FK
 * target of `catalog_item_id`), resolved by product slug — never the
 * storefront product id itself.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: channels, error: cErr } = await supabaseAdmin()
    .from('commerce_order_channels')
    .select('id,code,name,channel_type,active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true });
  if (cErr) return err('INTERNAL', cErr.message, 500);
  const item = await findCatalogItemForProduct(id);
  const { data: listings, error: lErr } = await supabaseAdmin()
    .from('commerce_channel_products')
    .select('id,channel_id,catalog_item_id,external_product_id,external_url,published,sync_status,sync_error,last_synced_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('catalog_item_id', item?.id ?? '00000000-0000-0000-0000-000000000000');
  if (lErr) return err('INTERNAL', lErr.message, 500);
  const byChannel = new Map(((listings ?? []) as { channel_id: string }[]).map((l) => [l.channel_id, l]));
  return NextResponse.json({
    data: ((channels ?? []) as { id: string; code: string; name: string; channel_type: string; active: boolean }[]).map((c) => {
      const l = byChannel.get(c.id) as { id: string; external_product_id: string | null; external_url: string | null; published: boolean; sync_status: string; sync_error: string | null; last_synced_at: string | null } | undefined;
      return {
        id: l?.id ?? null,
        channelId: c.id,
        channelCode: c.code,
        channelName: c.name,
        channelType: c.channel_type,
        channelActive: c.active,
        listed: !!l,
        published: l?.published ?? false,
        syncStatus: l?.sync_status ?? 'pending',
        syncError: l?.sync_error ?? null,
        lastSyncedAt: l?.last_synced_at ?? null,
        externalUrl: l?.external_url ?? null,
        externalProductId: l?.external_product_id ?? null,
      };
    }),
  });
}

/**
 * POST /api/products/[id]/channels — toggle a product's listing on a channel.
 * Body: { channel_id, published: boolean }. Creates the listing row when
 * there is none; flips `published` when there is. The listing is keyed by
 * the product's `commerce_catalog_items` row, provisioned from the real
 * product when the product has never been listed anywhere. Sync itself
 * (pushing the product to the channel) is the channel integration's job —
 * the row records the intent and its sync state.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const channelId = String(body.channel_id || '');
  if (!channelId) return err('VALIDATION', 'channel_id is required', 400);
  const published = body.published !== false;
  const { data: channel } = await supabaseAdmin()
    .from('commerce_order_channels')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return err('NOT_FOUND', 'Channel not found', 404);
  let item;
  try {
    item = await resolveOrCreateCatalogItem(id);
  } catch (e: unknown) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Could not resolve catalog item', 500);
  }
  const { data: existing } = await supabaseAdmin()
    .from('commerce_channel_products')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('channel_id', channelId)
    .eq('catalog_item_id', item.id)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabaseAdmin()
      .from('commerce_channel_products')
      .update({ published, sync_status: published ? 'pending' : 'disabled' })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data });
  }
  const { data, error } = await supabaseAdmin()
    .from('commerce_channel_products')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      channel_id: channelId,
      catalog_item_id: item.id,
      published,
      sync_status: published ? 'pending' : 'disabled',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
