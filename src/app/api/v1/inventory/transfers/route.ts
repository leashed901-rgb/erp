import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/v1/inventory/transfers — transfer history with lines. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const status = params.get('status');
  let query = supabaseAdmin()
    .from('erp_inventory_transfers')
    .select('id,transfer_number,from_warehouse_id,to_warehouse_id,status,requested_at,shipped_at,received_at,notes,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const whIds = [...new Set(rows.flatMap((r) => [r.from_warehouse_id, r.to_warehouse_id]))];
  const { data: whs } = await supabaseAdmin().from('erp_warehouses').select('id,name').in('id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000']);
  const whById = new Map(((whs ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
  const trIds = rows.map((r) => r.id);
  const { data: lines } = await supabaseAdmin()
    .from('erp_inventory_transfer_lines')
    .select('id,transfer_id,sku_id,quantity,shipped_quantity,received_quantity')
    .in('transfer_id', trIds.length ? trIds : ['00000000-0000-0000-0000-000000000000']);
  const skuIds = [...new Set(((lines ?? []) as { sku_id: string }[]).map((l) => l.sku_id))];
  const { data: skus } = await supabaseAdmin().from('erp_product_skus').select('id,sku').in('id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']);
  const skuById = new Map(((skus ?? []) as { id: string; sku: string }[]).map((s) => [s.id, s.sku]));
  const linesByTr = new Map<string, unknown[]>();
  for (const l of (lines ?? []) as { transfer_id: string; sku_id: string; quantity: number; shipped_quantity: number; received_quantity: number }[]) {
    const arr = linesByTr.get(l.transfer_id) ?? [];
    arr.push({ ...l, sku: skuById.get(l.sku_id) ?? null });
    linesByTr.set(l.transfer_id, arr);
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      from_warehouse: whById.get(r.from_warehouse_id) ?? null,
      to_warehouse: whById.get(r.to_warehouse_id) ?? null,
      lines: linesByTr.get(r.id) ?? [],
    })),
  });
}
