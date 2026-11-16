import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/v1/returns/[id] — one RMA with lines, inspections and refunds. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: rma, error } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !rma) return err('NOT_FOUND', 'Return not found', 404);
  const [{ data: lines }, { data: inspections }, { data: refunds }, { data: order }] = await Promise.all([
    supabaseAdmin().from('erp_return_lines').select('*').eq('rma_id', id).order('created_at', { ascending: true }),
    supabaseAdmin().from('erp_return_inspections').select('*').eq('rma_id', id).order('inspected_at', { ascending: false }),
    supabaseAdmin().from('erp_return_refunds').select('*').eq('rma_id', id).order('created_at', { ascending: false }),
    supabaseAdmin().from('erp_orders').select('id,order_number,total,amount_paid,amount_refunded').eq('id', rma.order_id).maybeSingle(),
  ]);
  const lineRows = (lines ?? []) as { id: string; order_line_id: string; sku_id: string }[];
  const orderLineIds = [...new Set(lineRows.map((l) => l.order_line_id))];
  const skuIds = [...new Set(lineRows.map((l) => l.sku_id))];
  const [{ data: orderLines }, { data: skus }] = await Promise.all([
    supabaseAdmin().from('erp_order_lines').select('id,description,quantity,unit_price').in('id', orderLineIds.length ? orderLineIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_product_skus').select('id,sku').in('id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const descByLine = new Map(((orderLines ?? []) as { id: string; description: string | null; quantity: number; unit_price: number }[]).map((o) => [o.id, o]));
  const skuById = new Map(((skus ?? []) as { id: string; sku: string }[]).map((s) => [s.id, s.sku]));
  let customer: string | null = null;
  if (rma.crm_customer_id) {
    const { data: c } = await supabaseAdmin()
      .from('crm_customers')
      .select('first_name,last_name,preferred_name,company_name')
      .eq('id', rma.crm_customer_id)
      .maybeSingle();
    if (c) customer = c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || null;
  }
  return NextResponse.json({
    data: {
      ...rma,
      order_number: (order as { order_number: string } | null)?.order_number ?? null,
      order_total: (order as { total: number } | null)?.total ?? null,
      order_amount_paid: (order as { amount_paid: number } | null)?.amount_paid ?? null,
      order_amount_refunded: (order as { amount_refunded: number } | null)?.amount_refunded ?? null,
      customer,
      lines: lineRows.map((l) => ({
        ...l,
        description: descByLine.get(l.order_line_id)?.description ?? null,
        sku: skuById.get(l.sku_id) ?? null,
      })),
      inspections: inspections ?? [],
      refunds: refunds ?? [],
    },
  });
}
