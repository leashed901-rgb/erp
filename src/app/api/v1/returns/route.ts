import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveOrCreateSku } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

function customerName(c: { first_name: string | null; last_name: string | null; preferred_name: string | null; company_name: string | null } | null): string | null {
  if (!c) return null;
  return c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || null;
}

/**
 * GET /api/v1/returns — list return authorizations (doc 17), enriched with
 * order number, customer name and the refund total so the screen never
 * renders '—' for rows that have real data.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('erp_return_authorizations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status && status !== 'all') query = query.eq('status', status);
  if (customerId) query = query.eq('crm_customer_id', customerId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const custIds = [...new Set(rows.map((r) => r.crm_customer_id).filter(Boolean))];
  const rmaIds = rows.map((r) => r.id);
  const [{ data: orders }, { data: customers }, { data: lines }, { data: refundRows }] = await Promise.all([
    supabaseAdmin().from('erp_orders').select('id,order_number').in('id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('crm_customers').select('id,first_name,last_name,preferred_name,company_name').in('id', custIds.length ? (custIds as string[]) : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_return_lines').select('rma_id,refund_amount,quantity_requested').in('rma_id', rmaIds.length ? rmaIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_return_refunds').select('rma_id,amount').in('rma_id', rmaIds.length ? rmaIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const orderById = new Map(((orders ?? []) as { id: string; order_number: string }[]).map((o) => [o.id, o.order_number]));
  const custById = new Map(((customers ?? []) as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; company_name: string | null }[]).map((c) => [c.id, c]));
  const refundByRma = new Map<string, number>();
  const itemsByRma = new Map<string, number>();
  for (const l of (lines ?? []) as { rma_id: string; refund_amount: number; quantity_requested: number }[]) {
    refundByRma.set(l.rma_id, (refundByRma.get(l.rma_id) ?? 0) + Number(l.refund_amount ?? 0));
    itemsByRma.set(l.rma_id, (itemsByRma.get(l.rma_id) ?? 0) + Number(l.quantity_requested ?? 0));
  }
  // The refunds table is the ledger of money actually returned; line
  // refund_amounts are the plan. Prefer the ledger when rows exist.
  const refundLedgerByRma = new Map<string, number>();
  for (const rf of (refundRows ?? []) as { rma_id: string; amount: number }[]) {
    refundLedgerByRma.set(rf.rma_id, (refundLedgerByRma.get(rf.rma_id) ?? 0) + Number(rf.amount ?? 0));
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      order_number: orderById.get(r.order_id) ?? null,
      customer: r.crm_customer_id ? customerName(custById.get(r.crm_customer_id) ?? null) : null,
      refund_total: Math.round(((refundLedgerByRma.get(r.id) ?? 0) > 0 ? (refundLedgerByRma.get(r.id) ?? 0) : (refundByRma.get(r.id) ?? 0)) * 100) / 100,
      items: itemsByRma.get(r.id) ?? 0,
    })),
  });
}

/**
 * POST /api/v1/returns — open a return (doc 17, registry `create.return_rma`
 * → `erp_open_return`).
 * Body: { order_id, lines: [{ order_line_id, quantity, disposition?,
 *         refund_amount? }], reason_code?, notes? }.
 * The old version inserted the RMA row directly with columns that do not
 * exist on `erp_return_authorizations` (`customer_id`, `resolution`), so
 * every create 500'd. The RPC validates the order, the per-line returnable
 * quantity and the warehouse SKU mapping, and numbers the RMA.
 * Lines whose order line has no warehouse SKU yet get one provisioned from
 * the linked catalog variant first (see lib/erpStock).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const orderId = String(body.order_id || '');
  const lines = (body.lines as { order_line_id?: string; quantity?: number; disposition?: string; refund_amount?: number }[] | undefined) ?? [];
  if (!orderId) return err('VALIDATION', 'order_id is required', 400);
  if (lines.length === 0) return err('VALIDATION', 'Choose at least one line to return', 400);
  // Return-window enforcement (pack 4 acceptance: an expired window is
  // rejected WITH the policy reason). Active category rules whose
  // category matches a returned line's product win over the global
  // rule; with no active rule there is no window restriction.
  {
    const sb = supabaseAdmin();
    const { data: order } = await sb
      .from('erp_orders')
      .select('id,order_number,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return err('VALIDATION', 'Order not found', 404);
    const { data: policies } = await sb
      .from('return_policy_rules')
      .select('scope,category_id,category_label,window_days')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true);
    const rules = (policies ?? []) as { scope: string; category_id: string | null; category_label: string | null; window_days: number }[];
    if (rules.length > 0) {
      let applicable: { window_days: number; scope: string; category_label: string | null } | null = null;
      const categoryRules = rules.filter((r) => r.scope === 'category');
      if (categoryRules.length > 0) {
        const { data: ols } = await sb
          .from('erp_order_lines')
          .select('sku_id')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('order_id', orderId)
          .in('id', lines.map((l) => String(l.order_line_id || '')));
        const variantIds = [...new Set(((ols ?? []) as { sku_id: string | null }[]).map((l) => l.sku_id).filter(Boolean))] as string[];
        if (variantIds.length > 0) {
          const { data: variants } = await sb.from('product_variants').select('product_id').in('id', variantIds);
          const productIds = [...new Set(((variants ?? []) as { product_id: string }[]).map((v) => v.product_id))];
          if (productIds.length > 0) {
            const { data: products } = await sb.from('products').select('category_id').in('id', productIds);
            const catIds = new Set(((products ?? []) as { category_id: string | null }[]).map((pr) => pr.category_id).filter(Boolean));
            const match = categoryRules
              .filter((r) => r.category_id && catIds.has(r.category_id))
              .sort((a, b) => a.window_days - b.window_days)[0];
            if (match) applicable = match;
          }
        }
      }
      if (!applicable) {
        const global = rules.filter((r) => r.scope === 'global').sort((a, b) => a.window_days - b.window_days)[0];
        if (global) applicable = global;
      }
      if (applicable) {
        const ageMs = Date.now() - new Date(order.created_at as string).getTime();
        const windowMs = applicable.window_days * 24 * 3600 * 1000;
        if (ageMs > windowMs) {
          return err(
            'RETURN_WINDOW_EXPIRED',
            `Return window expired: order ${order.order_number} was placed on ${String(order.created_at).slice(0, 10)}, outside the ${applicable.window_days}-day return window (${applicable.scope === 'category' ? `category policy${applicable.category_label ? ` — ${applicable.category_label}` : ''}` : 'global policy'}).`,
            400,
          );
        }
      }
    }
  }
  try {
    // Provision ERP SKUs for lines that have none, so erp_open_return's
    // erp__sku_for_variant lookup succeeds. A line links to its variant
    // through its design publication; lines with no publication and no SKU
    // cannot be mapped — the RPC then raises its own clear error.
    const { data: orderLines } = await supabaseAdmin()
      .from('erp_order_lines')
      .select('id,sku_id,design_publication_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('order_id', orderId)
      .in('id', lines.map((l) => String(l.order_line_id || '')));
    const lineById = new Map(((orderLines ?? []) as { id: string; sku_id: string | null; design_publication_id: string | null }[]).map((l) => [l.id, l]));
    for (const l of lines) {
      const ol = lineById.get(String(l.order_line_id || ''));
      if (ol && !ol.sku_id && ol.design_publication_id) {
        const { data: pub } = await supabaseAdmin()
          .from('design_publications')
          .select('product_variant_id')
          .eq('id', ol.design_publication_id)
          .maybeSingle();
        if (pub?.product_variant_id) {
          // Provision the ERP SKU so erp__sku_for_variant finds it — but
          // store the STOREFRONT variant id on the order line:
          // erp_order_lines.sku_id FK-references product_variants, not
          // erp_product_skus. The RPC resolves variant -> ERP SKU itself.
          await resolveOrCreateSku(pub.product_variant_id as string);
          const { error: updErr } = await supabaseAdmin()
            .from('erp_order_lines')
            .update({ sku_id: pub.product_variant_id })
            .eq('id', ol.id);
          if (updErr) return err('VALIDATION', `Could not link the order line to its variant: ${updErr.message}`, 400);
        }
      }
    }
    const rpcLines = lines.map((l) => ({
      order_line_id: l.order_line_id,
      quantity: Number(l.quantity),
      disposition: l.disposition || 'restock',
      refund_amount: l.refund_amount != null ? Number(l.refund_amount) : undefined,
    }));
    const { data: rmaId, error } = await supabaseAdmin().rpc('erp_open_return', {
      p_order_id: orderId,
      p_lines: rpcLines,
      p_reason_code: (body.reason_code as string) || null,
      p_notes: (body.notes as string) || null,
    });
    if (error) return err('INTERNAL', error.message, 500);
    const { data } = await supabaseAdmin()
      .from('erp_return_authorizations')
      .select('*')
      .eq('id', rmaId)
      .single();
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Open return failed', 500);
  }
}
