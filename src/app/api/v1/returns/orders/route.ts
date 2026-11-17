import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/returns/orders — orders a return can be opened from (doc 17:
 * "Pick from order"). Only orders with lines that still have unreturned
 * quantity, excluding cancelled orders. Each order carries its lines with
 * the remaining returnable quantity so the picker can offer real lines.
 */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  let query = supabaseAdmin()
    .from('erp_orders')
    .select('id,order_number,status,currency,total,amount_paid,crm_customer_id,customer_email,order_date')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .neq('status', 'cancelled')
    .order('order_date', { ascending: false })
    .limit(50);
  if (q) query = query.ilike('order_number', `%${q}%`);
  const { data: orders, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = orders ?? [];
  const orderIds = rows.map((o) => o.id);
  const { data: lines } = await supabaseAdmin()
    .from('erp_order_lines')
    .select('id,order_id,description,quantity,unit_price,line_total,quantity_returned,quantity_shipped,sku_id')
    .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: true });
  const { data: pending } = await supabaseAdmin()
    .from('erp_return_lines')
    .select('rma_id,order_line_id,quantity_requested')
    .in('order_line_id', ((lines ?? []) as { id: string }[]).map((l) => l.id));
  // Pending quantities only count for RMAs that are still open — declined,
  // cancelled and completed RMAs free their quantities again (same rule
  // erp_open_return applies server-side).
  const pendingRmaIds = [...new Set(((pending ?? []) as { rma_id: string }[]).map((p) => p.rma_id))];
  const { data: pendingRmas } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .select('id,status')
    .in('id', pendingRmaIds.length ? pendingRmaIds : ['00000000-0000-0000-0000-000000000000']);
  const openRma = new Set(
    ((pendingRmas ?? []) as { id: string; status: string }[])
      .filter((r) => !['declined', 'cancelled', 'completed'].includes(r.status))
      .map((r) => r.id),
  );
  const pendingByLine = new Map<string, number>();
  for (const p of (pending ?? []) as { rma_id: string; order_line_id: string; quantity_requested: number }[]) {
    if (!openRma.has(p.rma_id)) continue;
    pendingByLine.set(p.order_line_id, (pendingByLine.get(p.order_line_id) ?? 0) + Number(p.quantity_requested ?? 0));
  }
  const custIds = [...new Set(rows.map((o) => o.crm_customer_id).filter(Boolean))];
  const { data: customers } = await supabaseAdmin()
    .from('crm_customers')
    .select('id,first_name,last_name,preferred_name,company_name')
    .in('id', custIds.length ? (custIds as string[]) : ['00000000-0000-0000-0000-000000000000']);
  const custById = new Map(((customers ?? []) as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; company_name: string | null }[]).map((c) => [c.id, c]));
  const linesByOrder = new Map<string, unknown[]>();
  for (const l of (lines ?? []) as { id: string; order_id: string; quantity: number; quantity_returned: number }[]) {
    const remaining = Number(l.quantity) - Number(l.quantity_returned ?? 0) - (pendingByLine.get(l.id) ?? 0);
    const arr = linesByOrder.get(l.order_id) ?? [];
    arr.push({ ...l, remaining });
    linesByOrder.set(l.order_id, arr);
  }
  return NextResponse.json({
    data: rows
      .map((o) => {
        const c = o.crm_customer_id ? custById.get(o.crm_customer_id) : undefined;
        return {
          ...o,
          customer: c ? (c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || null) : null,
          lines: (linesByOrder.get(o.id) ?? []).filter((l) => (l as { remaining: number }).remaining > 0),
        };
      })
      .filter((o) => (o.lines as unknown[]).length > 0),
  });
}
