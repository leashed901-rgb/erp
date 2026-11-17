import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/inventory/movements — the stock ledger (doc 16: "the stock
 * ledger records every movement with a source pill"). Every adjustment,
 * transfer, receipt and return writes a row here via `erp__move`; the
 * trigger on this table maintains `erp_stock_levels`.
 * Filters: ?sku_id= (ERP SKU id), ?warehouse_id=, ?type=, ?limit= (default 100).
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const skuId = params.get('sku_id');
  const warehouseId = params.get('warehouse_id');
  const type = params.get('type');
  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '100', 10) || 100, 1), 500);
  let query = supabaseAdmin()
    .from('erp_inventory_movements')
    .select('id,movement_type,sku_id,warehouse_id,from_location_id,to_location_id,quantity,unit_cost,total_cost,source_type,source_id,reference,reason,occurred_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (skuId) query = query.eq('sku_id', skuId);
  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  if (type) query = query.eq('movement_type', type);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const whIds = [...new Set(rows.map((r) => r.warehouse_id).filter(Boolean))];
  const skuIds = [...new Set(rows.map((r) => r.sku_id))];
  const [{ data: whs }, { data: skus }] = await Promise.all([
    supabaseAdmin().from('erp_warehouses').select('id,name').in('id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_product_skus').select('id,sku').in('id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const whById = new Map(((whs ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
  const skuById = new Map(((skus ?? []) as { id: string; sku: string }[]).map((s) => [s.id, s.sku]));
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      warehouse: r.warehouse_id ? (whById.get(r.warehouse_id) ?? null) : null,
      sku: skuById.get(r.sku_id) ?? null,
    })),
  });
}
