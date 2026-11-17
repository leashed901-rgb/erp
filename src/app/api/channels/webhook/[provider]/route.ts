import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface WebhookItem {
  sku?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
}

/**
 * POST /api/channels/webhook/[provider] — inbound channel webhook
 * (SHIP-IT pack 3 step 2): the event lands in integration_webhook_inbox,
 * an order event becomes an erp_orders row exactly once (idempotent on
 * provider + event_id — a replay returns the original order and creates
 * nothing), the channel ref is recorded in commerce_order_channel_refs,
 * and acct_sync_erp_order registers the order and posts the books.
 *
 * Body: { event_id, event_type?, order: { external_id, email, total,
 *         currency?, items?: [{ sku, name, quantity, unit_price }] } }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON body', 400); }

  const order = (body.order || {}) as Record<string, any>;
  const externalOrderId = String(order.external_id || order.id || '');
  const eventId = String(body.event_id || externalOrderId || '');
  if (!eventId) return err('VALIDATION', 'event_id (or order.external_id) is required', 400);
  const eventType = String(body.event_type || 'order.created');
  const db = supabaseAdmin();

  // The inbox FK-references the provider registry; ensure the row.
  await db.from('integration_providers').upsert(
    { code: provider, name: provider, category: 'commerce_channel', is_enabled: true },
    { onConflict: 'code' },
  );

  // Idempotency: an already-processed event returns its original order.
  const { data: prior } = await db
    .from('integration_webhook_inbox')
    .select('id, status, payload')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider)
    .eq('event_id', eventId)
    .maybeSingle();
  if (prior?.status === 'processed') {
    const { data: ref } = await db
      .from('commerce_order_channel_refs')
      .select('erp_order_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('external_order_id', externalOrderId || eventId)
      .maybeSingle();
    return NextResponse.json({ data: { duplicate: true, inboxId: prior.id, orderId: ref?.erp_order_id || null } });
  }

  // Connection (if the channel is connected) for the inbox row.
  const { data: conn } = await db
    .from('integration_connections')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider)
    .maybeSingle();

  let inboxId = prior?.id as string | undefined;
  if (!inboxId) {
    const { data: inbox, error } = await db
      .from('integration_webhook_inbox')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        provider_code: provider,
        event_id: eventId,
        event_type: eventType,
        connection_id: conn?.id || null,
        signature_valid: true,
        payload: body,
        status: 'received',
        attempts: 1,
      })
      .select('id')
      .single();
    if (error || !inbox) return err('INTERNAL', error?.message || 'Inbox insert failed', 500);
    inboxId = inbox.id;
  }

  const fail = async (message: string) => {
    await db.from('integration_webhook_inbox')
      .update({ status: 'failed', error: message })
      .eq('id', inboxId);
    return err('PROCESSING', message, 422);
  };

  if (!eventType.startsWith('order')) {
    await db.from('integration_webhook_inbox')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', inboxId);
    return NextResponse.json({ data: { inboxId, ignored: true, reason: `event_type ${eventType} does not create orders` } });
  }
  if (!externalOrderId) return fail('order.external_id is required for order events');

  // Idempotency anchored on the order itself: if this channel order
  // was already imported (even if a later step failed on a previous
  // delivery), the replay creates nothing and returns that order.
  const { data: existingOrder } = await db
    .from('erp_orders')
    .select('id, order_number')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('sales_channel', provider)
    .eq('source_order_id', externalOrderId)
    .maybeSingle();
  if (existingOrder) {
    await db.from('integration_webhook_inbox')
      .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
      .eq('id', inboxId);
    return NextResponse.json({ data: { duplicate: true, inboxId, orderId: existingOrder.id, orderNumber: existingOrder.order_number } });
  }

  const total = Number(order.total ?? order.total_price ?? 0);
  const email = order.email ? String(order.email) : null;
  const items = (Array.isArray(order.items) ? order.items : []) as WebhookItem[];

  // Resolve the channel row for the ref.
  const { data: channel } = await db
    .from('commerce_order_channels')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', provider)
    .maybeSingle();

  const orderId = randomUUID();
  const orderNumber = `CH-${provider.toUpperCase()}-${externalOrderId}`.slice(0, 40);
  const { error: oErr } = await db.from('erp_orders').insert({
    id: orderId,
    tenant_id: DEFAULT_TENANT_ID,
    order_number: orderNumber,
    source_order_id: externalOrderId,
    status: 'fulfilled',
    fulfillment_method: 'channel',
    sales_channel: provider,
    marketplace_name: provider,
    is_marketplace_facilitated: true,
    currency: String(order.currency || 'USD'),
    subtotal: total,
    total,
    amount_paid: total,
    balance_due: 0,
    customer_email: email,
    order_date: new Date().toISOString(),
    notes: `Imported from ${provider} webhook event ${eventId}`,
    metadata: {},
  });
  if (oErr) return fail(`Order insert failed: ${oErr.message}`);

  // Line items — match SKUs to variants where possible; unmatched
  // lines are still recorded (product_variant_id is nullable).
  for (const item of items) {
    let variantId: string | null = null;
    if (item.sku) {
      const { data: variant } = await db
        .from('product_variants')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('sku', item.sku)
        .maybeSingle();
      variantId = variant?.id || null;
    }
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitPrice = Number(item.unit_price) || 0;
    await db.from('order_items').insert({
      id: randomUUID(),
      order_id: orderId,
      tenant_id: DEFAULT_TENANT_ID,
      product_variant_id: variantId,
      quantity: qty,
      unit_price: unitPrice,
    });
    if (variantId) {
      await db.from('erp_order_lines').insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        order_id: orderId,
        sku_id: variantId,
        description: item.name || item.sku || undefined,
        quantity: qty,
        unit_price: unitPrice,
        discount_amount: 0,
        tax_amount: 0,
        line_total: Math.round(qty * unitPrice * 100) / 100,
        quantity_reserved: 0,
        quantity_allocated: 0,
        quantity_picked: 0,
        quantity_packed: 0,
        quantity_shipped: qty,
        quantity_returned: 0,
        status: 'fulfilled',
      });
    }
  }

  if (channel) {
    await db.from('commerce_order_channel_refs').insert({
      tenant_id: DEFAULT_TENANT_ID,
      channel_id: channel.id,
      erp_order_id: orderId,
      external_order_id: externalOrderId,
      external_status: String(order.status || 'paid'),
      payload: order,
    });
  }

  // Register + post the books via the sanctioned batch entry (see
  // the checkout route for the platform safeupdate gap). The webhook
  // itself is processed once the order exists exactly once; the
  // order's posting state is reported from its postings row.
  await db.rpc('acct_sync_pending_orders', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data: posting } = await db
    .from('acct_order_postings')
    .select('sale_journal_id, payments_posted, last_error')
    .eq('order_id', orderId)
    .maybeSingle();
  const sync = posting?.sale_journal_id
    ? { status: 'posted', saleJournalId: posting.sale_journal_id, paymentsPosted: posting.payments_posted }
    : { status: 'pending', reason: posting?.last_error || 'awaiting books sync' };

  await db.from('integration_webhook_inbox')
    .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
    .eq('id', inboxId);

  return NextResponse.json({ data: { inboxId, orderId, orderNumber, sync } }, { status: 201 });
}
