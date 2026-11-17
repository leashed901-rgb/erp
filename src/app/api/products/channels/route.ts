import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/products/channels — sales channels (`commerce_order_channels`).
 * The tenant has none configured yet; the list is empty until a channel is
 * added. Each channel carries its per-product listing count.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('commerce_order_channels')
    .select('id,code,name,channel_type,active,configuration')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const chIds = rows.map((c) => c.id);
  const { data: listings } = await supabaseAdmin()
    .from('commerce_channel_products')
    .select('channel_id,published')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('channel_id', chIds.length ? chIds : ['00000000-0000-0000-0000-000000000000']);
  const byChannel = new Map<string, { total: number; published: number }>();
  for (const l of (listings ?? []) as { channel_id: string; published: boolean }[]) {
    const cur = byChannel.get(l.channel_id) ?? { total: 0, published: 0 };
    cur.total += 1;
    if (l.published) cur.published += 1;
    byChannel.set(l.channel_id, cur);
  }
  return NextResponse.json({
    data: rows.map((c) => ({ ...c, ...(byChannel.get(c.id) ?? { total: 0, published: 0 }) })),
  });
}

/**
 * POST /api/products/channels — add a sales channel row (code, name,
 * channel_type). Connecting a channel (OAuth / API keys) is a settings
 * integration step; this registers the channel so products can be listed
 * on it. Codes are unique per tenant.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim().toLowerCase();
  const channelType = String(body.channel_type || '').trim().toLowerCase();
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!channelType) return err('VALIDATION', 'channel_type is required (e.g. ecommerce, tiktok, amazon, etsy, ebay)', 400);
  const { data: dupe } = await supabaseAdmin()
    .from('commerce_order_channels')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', code)
    .maybeSingle();
  if (dupe) return err('VALIDATION', `Channel code "${code}" already exists`, 400);
  const { data, error } = await supabaseAdmin()
    .from('commerce_order_channels')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      code,
      name,
      channel_type: channelType,
      active: body.active !== false,
      configuration: (body.configuration as Record<string, unknown>) ?? {},
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
