import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { CHANNEL_PROVIDERS } from '@/lib/channelProviders';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/channels/connect — connect a sales channel (SHIP-IT pack 3
 * step 1): the channel row lands in commerce_order_channels, the
 * connection in integration_connections (where OAuth credentials land
 * when the provider flow completes), and the webhook registration is
 * upserted in commerce_webhooks. Idempotent per provider.
 * Body: { provider, display_name?, external_account_id?, webhook_url? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON body', 400); }
  const provider = String(body.provider || '').trim().toLowerCase();
  const meta = CHANNEL_PROVIDERS[provider];
  if (!meta) return err('VALIDATION', `Unknown provider "${provider}"`, 400);

  const db = supabaseAdmin();
  const displayName = String(body.display_name || meta.label);

  // The provider registry (integration_providers) is the FK parent of
  // connections and the webhook inbox; ensure the provider's row
  // exists as part of connecting it.
  await db.from('integration_providers').upsert(
    { code: provider, name: meta.label, category: 'commerce_channel', is_enabled: true },
    { onConflict: 'code' },
  );
  const webhookUrl = String(body.webhook_url || `https://unleashe.app/api/channels/webhook/${provider}`);

  // Channel row (upsert on tenant+code).
  const { data: existing } = await db
    .from('commerce_order_channels')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', provider)
    .maybeSingle();
  let channelId = existing?.id as string | undefined;
  if (channelId) {
    await db.from('commerce_order_channels')
      .update({ name: displayName, channel_type: meta.channelType, active: true })
      .eq('id', channelId);
  } else {
    const { data: created, error } = await db
      .from('commerce_order_channels')
      .insert({ tenant_id: DEFAULT_TENANT_ID, code: provider, name: displayName, channel_type: meta.channelType, active: true, configuration: {} })
      .select('id')
      .single();
    if (error || !created) return err('INTERNAL', error?.message || 'Channel create failed', 500);
    channelId = created.id;
  }

  // Connection row (upsert on tenant+provider_code).
  const connPayload = {
    status: 'active',
    display_name: displayName,
    external_account_id: body.external_account_id ? String(body.external_account_id) : null,
    connected_at: new Date().toISOString(),
    last_error: null,
    config: { webhook_url: webhookUrl },
  };
  const { data: connExisting } = await db
    .from('integration_connections')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider)
    .maybeSingle();
  if (connExisting) {
    await db.from('integration_connections').update(connPayload).eq('id', connExisting.id);
  } else {
    const { error } = await db
      .from('integration_connections')
      .insert({ tenant_id: DEFAULT_TENANT_ID, provider_code: provider, environment: 'production', ...connPayload });
    if (error) return err('INTERNAL', error.message, 500);
  }

  // Webhook registration (upsert on channel_id).
  const { data: hookExisting } = await db
    .from('commerce_webhooks')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('channel_id', channelId)
    .maybeSingle();
  const hookPayload = { url: webhookUrl, events: ['order.created', 'order.updated', 'product.updated'], active: true };
  if (hookExisting) {
    await db.from('commerce_webhooks').update(hookPayload).eq('id', hookExisting.id);
  } else {
    await db.from('commerce_webhooks').insert({ tenant_id: DEFAULT_TENANT_ID, channel_id: channelId, ...hookPayload });
  }

  return NextResponse.json({ data: { provider, channelId, status: 'active', webhookUrl } }, { status: 201 });
}
