import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/channels/disconnect { provider } — mark the connection
 * disconnected, pause the channel and its webhook registrations.
 * Rows are kept (order history references them); nothing is deleted.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON body', 400); }
  const provider = String(body.provider || '').trim().toLowerCase();
  if (!provider) return err('VALIDATION', 'provider is required', 400);
  const db = supabaseAdmin();

  await db.from('integration_connections')
    .update({ status: 'disconnected' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider);

  const { data: channel } = await db
    .from('commerce_order_channels')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', provider)
    .maybeSingle();
  if (channel) {
    await db.from('commerce_order_channels').update({ active: false }).eq('id', channel.id);
    await db.from('commerce_webhooks').update({ active: false }).eq('tenant_id', DEFAULT_TENANT_ID).eq('channel_id', channel.id);
  }
  return NextResponse.json({ data: { provider, status: 'disconnected' } });
}
