import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { calculateSalesTax, resolveTaxJurisdictionId } from '@/lib/taxEngine';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface CheckoutItem {
  variant_id: string;
  quantity: number;
}

/**
 * POST /api/store/checkout — the storefront checkout (pack 3): a cart
 * becomes a checkout session becomes an order, in one flow.
 * Promotions are enforced server-side against commerce_promotions
 * (active window, minimum subtotal, usage limit; usage_count is
 * incremented on success). The order lands in erp_orders as paid +
 * fulfilled with its lines, a commerce_orders mirror linked by
 * erp_order_id, a commerce_payments record, and then
 * acct_sync_erp_order registers it and posts the books (payment,
 * revenue, inventory) — the acceptance loop from USER-GUIDE-3.
 *
 * Body: { customer_email, customer_id?, items: [{ variant_id,
 * quantity }], promotion_code?, channel? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const items = (Array.isArray(body.items) ? body.items : []) as CheckoutItem[];
  if (!items.length) return err('VALIDATION', 'items are required', 400);
  const email = body.customer_email ? String(body.customer_email) : null;
  const customerId = body.customer_id ? String(body.customer_id) : null;
  const channel = body.channel ? String(body.channel) : 'website';
  const db = supabaseAdmin();

  // Price the cart from the variants (server-side truth).
  const variantIds = items.map(i => i.variant_id);
  const { data: variants, error: vErr } = await db
    .from('product_variants')
    .select('id, price, sku, product_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('id', variantIds);
  if (vErr) return err('INTERNAL', vErr.message, 500);
  const byId = new Map((variants || []).map(v => [v.id, v]));
  let subtotal = 0;
  const lines: { variantId: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number }[] = [];
  for (const item of items) {
    const v = byId.get(item.variant_id);
    if (!v) return err('VALIDATION', `Unknown variant ${item.variant_id}`, 400);
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitPrice = Number(v.price) || 0;
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    subtotal += lineTotal;
    lines.push({ variantId: v.id, sku: v.sku, quantity: qty, unitPrice, lineTotal });
  }
  subtotal = Math.round(subtotal * 100) / 100;

  // Promotion (server-side enforcement).
  let discount = 0;
  let promo: { id: string; code: string } | null = null;
  if (body.promotion_code) {
    const code = String(body.promotion_code).toUpperCase();
    const { data: found } = await db
      .from('commerce_promotions')
      .select('id, code, promotion_type, value, minimum_subtotal, maximum_discount, start_at, end_at, usage_limit, usage_count, active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('code', code)
      .maybeSingle();
    const now = new Date();
    const valid = found && found.active
      && (!found.start_at || new Date(found.start_at) <= now)
      && (!found.end_at || new Date(found.end_at) >= now)
      && subtotal >= Number(found.minimum_subtotal || 0)
      && (!found.usage_limit || Number(found.usage_count || 0) < Number(found.usage_limit));
    if (!valid) return err('VALIDATION', `Promotion ${code} is not valid for this cart`, 400);
    discount = found.promotion_type === 'percent'
      ? Math.round(subtotal * (Number(found.value) / 100) * 100) / 100
      : Number(found.value);
    if (found.maximum_discount) discount = Math.min(discount, Number(found.maximum_discount));
    discount = Math.min(discount, subtotal);
    promo = { id: found.id, code: found.code };
  }
  // Sales tax (pack 5): the engine (acct_calculate_tax) prices the tax
  // for the ship-to jurisdiction — resolved from the shipping state,
  // falling back to the tenant's default jurisdiction. The charged
  // tax_total + metadata.tax_jurisdiction_id are what the books engine
  // (acct__order_recognize) spreads over the jurisdiction chain into
  // acct_tax_transactions when the order posts. No jurisdiction or no
  // nexus → the engine returns 0 with its reason, and the order is
  // honestly tax-free.
  const shipAddr = (body.shipping_address || null) as { line1?: string; city?: string; state?: string; postal_code?: string; country_code?: string } | null;
  const shipState = (shipAddr?.state || (body.ship_to_state ? String(body.ship_to_state) : '')).toUpperCase() || null;
  const taxJurisdictionId = await resolveTaxJurisdictionId(db, { stateCode: shipState });
  let taxTotal = 0;
  const lineTaxes: number[] = lines.map(() => 0);
  if (taxJurisdictionId && subtotal > 0) {
    try {
      const discounted = lines.map((l) => Math.round((l.lineTotal - (discount > 0 && subtotal > 0 ? (discount * l.lineTotal) / subtotal : 0)) * 100) / 100);
      const { rows, taxTotal: engineTax } = await calculateSalesTax(db, {
        lines: discounted.map((amount, i) => ({ line_ref: String(i + 1), amount, tax_category: 'general' })),
        jurisdictionId: taxJurisdictionId,
        customerId,
      });
      taxTotal = engineTax;
      for (const r of rows) {
        const idx = Number(r.line_ref) - 1;
        if (idx >= 0 && idx < lineTaxes.length) lineTaxes[idx] = Math.round((lineTaxes[idx] + Number(r.tax_amount || 0)) * 100) / 100;
      }
    } catch {
      // Engine unavailable → charge no tax rather than inventing a rate;
      // the order still posts and the tax detail stays honestly empty.
      taxTotal = 0;
      lineTaxes.fill(0);
    }
  }
  const total = Math.round((subtotal - discount + taxTotal) * 100) / 100;

  // Cart → converted.
  const cartId = randomUUID();
  const { error: cErr } = await db.from('commerce_carts').insert({
    id: cartId,
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: customerId,
    status: 'converted',
    currency: 'USD',
    subtotal,
    discount_total: discount,
    tax_total: taxTotal,
    shipping_total: 0,
    total,
  });
  if (cErr) return err('INTERNAL', `Cart insert failed: ${cErr.message}`, 500);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.from('commerce_cart_lines').insert({
      cart_id: cartId,
      line_no: i + 1,
      description: l.sku || l.variantId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_amount: 0,
      tax_amount: lineTaxes[i] || 0,
      line_total: l.lineTotal,
      metadata: { variant_id: l.variantId },
    });
  }

  // Order (erp_orders) — paid + fulfilled so the books recognize it.
  const orderId = randomUUID();
  const orderNumber = `WEB-${Date.now().toString(36).toUpperCase()}`;
  const { error: oErr } = await db.from('erp_orders').insert({
    id: orderId,
    tenant_id: DEFAULT_TENANT_ID,
    order_number: orderNumber,
    status: 'fulfilled',
    fulfillment_method: 'storefront',
    sales_channel: channel,
    currency: 'USD',
    subtotal,
    discount_total: discount,
    tax_total: taxTotal,
    shipping_total: 0,
    total,
    amount_paid: total,
    balance_due: 0,
    crm_customer_id: customerId,
    customer_email: email,
    order_date: new Date().toISOString(),
    notes: promo ? `Storefront checkout · promotion ${promo.code}` : 'Storefront checkout',
    metadata: taxJurisdictionId ? { tax_jurisdiction_id: taxJurisdictionId } : {},
  });
  if (oErr) return err('INTERNAL', `Order insert failed: ${oErr.message}`, 500);
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    await db.from('order_items').insert({
      id: randomUUID(),
      order_id: orderId,
      tenant_id: DEFAULT_TENANT_ID,
      product_variant_id: l.variantId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
    });
    // The books engine reads erp_order_lines (sku_id = variant id):
    // revenue, COGS and inventory post from these rows.
    await db.from('erp_order_lines').insert({
      id: randomUUID(),
      tenant_id: DEFAULT_TENANT_ID,
      order_id: orderId,
      sku_id: l.variantId,
      description: l.sku || undefined,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_amount: 0,
      tax_amount: lineTaxes[li] || 0,
      line_total: l.lineTotal,
      quantity_reserved: 0,
      quantity_allocated: 0,
      quantity_picked: 0,
      quantity_packed: 0,
      quantity_shipped: l.quantity,
      quantity_returned: 0,
      status: 'fulfilled',
    });
  }

  // Shipping address — the nexus exposure counters
  // (tax_us_sales_by_state) read the sale's state from here.
  if (shipAddr?.line1 && shipAddr?.city && shipState) {
    await db.from('erp_order_addresses').insert({
      id: randomUUID(),
      tenant_id: DEFAULT_TENANT_ID,
      order_id: orderId,
      address_type: 'shipping',
      line1: shipAddr.line1,
      city: shipAddr.city,
      state: shipState,
      postal_code: shipAddr.postal_code || null,
      country_code: (shipAddr.country_code || 'US').toUpperCase(),
    });
  }

  // The sale record (commerce_sales) — sessions and payments both
  // FK to it; it links back to the erp order.
  const { data: sale, error: saleErr } = await db.from('commerce_sales').insert({
    tenant_id: DEFAULT_TENANT_ID,
    sale_number: orderNumber,
    cart_id: cartId,
    erp_order_id: orderId,
    customer_id: customerId,
    source: 'storefront',
    status: 'completed',
    currency: 'USD',
    subtotal,
    discount_total: discount,
    tax_total: taxTotal,
    shipping_total: 0,
    total,
    paid_total: total,
    change_due: 0,
    completed_at: new Date().toISOString(),
    metadata: { channel },
  }).select('id').single();
  if (saleErr || !sale) return err('INTERNAL', `Sale insert failed: ${saleErr?.message}`, 500);

  // Checkout session — completed.
  const { data: session, error: sessErr } = await db.from('commerce_checkout_sessions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    cart_id: cartId,
    sale_id: sale.id,
    customer_id: customerId,
    status: 'completed',
    amount_due: total,
    amount_received: total,
    change_due: 0,
    completed_at: new Date().toISOString(),
  }).select('id').single();
  if (sessErr) return err('INTERNAL', `Checkout session failed: ${sessErr.message}`, 500);

  // Storefront mirror + payment record. The mirror insert is checked: an
  // unchecked failure here used to drop the commerce_orders row silently
  // on every checkout (commerce_orders.id had no default until
  // 20261115190000). The order itself is already created and paid by this
  // point, so a mirror failure is reported, not fatal.
  const { error: mirrorErr } = await db.from('commerce_orders').insert({
    tenant_id: DEFAULT_TENANT_ID,
    erp_order_id: orderId,
    email,
    customer_email: email,
    customer_id: customerId,
    subtotal,
    total_amount: total,
    status: 'confirmed',
    payment_status: 'paid',
    fulfillment_status: 'fulfilled',
    coupon_id: promo?.id || null,
    metadata: { channel, cart_id: cartId },
  });
  // Payment method: resolve the tenant's card method, creating the
  // tenant configuration row on first use.
  let { data: method } = await db
    .from('commerce_payment_methods')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', 'card')
    .maybeSingle();
  if (!method) {
    const { data: created } = await db
      .from('commerce_payment_methods')
      .insert({ tenant_id: DEFAULT_TENANT_ID, code: 'card', name: 'Card', method_type: 'card', processor: 'stripe', active: true, configuration: {} })
      .select('id')
      .single();
    method = created;
  }

  const { data: payment, error: payErr } = await db.from('commerce_payments').insert({
    tenant_id: DEFAULT_TENANT_ID,
    payment_number: `PAY-${orderNumber}`,
    sale_id: sale.id,
    payment_method_id: method?.id || null,
    customer_id: customerId,
    amount: total,
    currency: 'USD',
    status: 'succeeded',
    external_reference: orderNumber,
  }).select('id').single();
  if (payErr) return err('INTERNAL', `Payment record failed: ${payErr.message}`, 500);

  if (promo) {
    const { data: current } = await db
      .from('commerce_promotions')
      .select('usage_count')
      .eq('id', promo.id)
      .single();
    await db.from('commerce_promotions')
      .update({ usage_count: Number(current?.usage_count || 0) + 1 })
      .eq('id', promo.id);
  }

  // Register + post the books. The order trigger has already
  // registered the acct_order_postings row; acct_sync_pending_orders
  // is the sanctioned batch entry that posts pending orders and
  // records last_error per order. The order's true posting state is
  // read back from its postings row and returned, never assumed.
  await db.rpc('acct_sync_pending_orders', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data: posting } = await db
    .from('acct_order_postings')
    .select('sale_journal_id, payments_posted, last_error, synced_at')
    .eq('order_id', orderId)
    .maybeSingle();
  const sync = posting?.sale_journal_id
    ? { status: 'posted', saleJournalId: posting.sale_journal_id, paymentsPosted: posting.payments_posted, syncedAt: posting.synced_at }
    : { status: 'pending', reason: posting?.last_error || 'awaiting books sync' };

  return NextResponse.json({
    data: {
      orderId,
      orderNumber,
      cartId,
      sessionId: session?.id || null,
      saleId: sale.id,
      paymentId: payment?.id || null,
      subtotal,
      discount,
      tax_total: taxTotal,
      tax_jurisdiction_id: taxJurisdictionId,
      total,
      promotion: promo,
      sync,
      ...(mirrorErr ? { mirror_error: mirrorErr.message } : {}),
    },
  }, { status: 201 });
}
