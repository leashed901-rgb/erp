import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveOrCreateSku } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/inventory/replenishment — replenishment rules (doc 16:
 * `erp_replenishment_rules` — reorder point, safety stock, EOQ, lead time,
 * preferred vendor) enriched with SKU / product / warehouse / vendor names,
 * plus the live on-hand per rule so the screen can show which rules are
 * currently tripped.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('erp_replenishment_rules')
    .select('id,sku_id,warehouse_id,method,reorder_point,safety_stock,maximum_stock,economic_order_quantity,lead_time_days,review_period_days,preferred_vendor_id,is_active,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const skuIds = [...new Set(rows.map((r) => r.sku_id))];
  const whIds = [...new Set(rows.map((r) => r.warehouse_id))];
  const vendorIds = [...new Set(rows.map((r) => r.preferred_vendor_id).filter(Boolean))];
  const [{ data: skus }, { data: whs }, { data: levels }] = await Promise.all([
    supabaseAdmin().from('erp_product_skus').select('id,sku,product_id').in('id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_warehouses').select('id,name').in('id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin().from('erp_stock_levels').select('sku_id,warehouse_id,on_hand,reserved').in('sku_id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const skuById = new Map(((skus ?? []) as { id: string; sku: string; product_id: string }[]).map((s) => [s.id, s]));
  const whById = new Map(((whs ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
  const productIds = [...new Set([...skuById.values()].map((s) => s.product_id))];
  const { data: products } = await supabaseAdmin().from('products').select('id,name').in('id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']);
  const nameByProduct = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const { data: vendors } = await supabaseAdmin()
    .from('acct_vendors')
    .select('id,legal_name,display_name')
    .in('id', vendorIds.length ? (vendorIds as string[]) : ['00000000-0000-0000-0000-000000000000']);
  const vendorById = new Map(((vendors ?? []) as { id: string; legal_name: string; display_name: string | null }[]).map((v) => [v.id, v.display_name || v.legal_name]));
  const onHandByKey = new Map<string, { on_hand: number; reserved: number }>();
  for (const l of (levels ?? []) as { sku_id: string; warehouse_id: string; on_hand: number; reserved: number }[]) {
    const k = `${l.sku_id}:${l.warehouse_id}`;
    const cur = onHandByKey.get(k) ?? { on_hand: 0, reserved: 0 };
    cur.on_hand += Number(l.on_hand ?? 0);
    cur.reserved += Number(l.reserved ?? 0);
    onHandByKey.set(k, cur);
  }
  return NextResponse.json({
    data: rows.map((r) => {
      const sku = skuById.get(r.sku_id);
      const oh = onHandByKey.get(`${r.sku_id}:${r.warehouse_id}`) ?? { on_hand: 0, reserved: 0 };
      return {
        ...r,
        sku: sku?.sku ?? null,
        product: sku ? (nameByProduct.get(sku.product_id) ?? null) : null,
        warehouse: whById.get(r.warehouse_id) ?? null,
        preferred_vendor: r.preferred_vendor_id ? (vendorById.get(r.preferred_vendor_id) ?? null) : null,
        on_hand: oh.on_hand,
        available: oh.on_hand - oh.reserved,
        tripped: oh.on_hand - oh.reserved <= Number(r.reorder_point ?? 0),
      };
    }),
  });
}

/**
 * POST /api/v1/inventory/replenishment — create or update a rule for one
 * SKU in one warehouse (upsert by that pair). Body: { variant_id | sku_id,
 * warehouse_id, reorder_point, safety_stock?, maximum_stock?,
 * economic_order_quantity?, lead_time_days?, preferred_vendor_id?, method? }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const warehouseId = String(body.warehouse_id || '');
  const reorderPoint = Number(body.reorder_point);
  if (!warehouseId) return err('VALIDATION', 'warehouse_id is required', 400);
  if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
    return err('VALIDATION', 'reorder_point must be a number ≥ 0', 400);
  }
  try {
    let skuId = (body.sku_id as string) || '';
    if (!skuId && body.variant_id) skuId = (await resolveOrCreateSku(String(body.variant_id))).id;
    if (!skuId) return err('VALIDATION', 'variant_id or sku_id is required', 400);
    const { data: existing } = await supabaseAdmin()
      .from('erp_replenishment_rules')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('sku_id', skuId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle();
    const values = {
      tenant_id: DEFAULT_TENANT_ID,
      sku_id: skuId,
      warehouse_id: warehouseId,
      method: (body.method as string) || 'reorder_point',
      reorder_point: reorderPoint,
      safety_stock: body.safety_stock != null ? Number(body.safety_stock) : 0,
      maximum_stock: body.maximum_stock != null ? Number(body.maximum_stock) : null,
      economic_order_quantity: body.economic_order_quantity != null ? Number(body.economic_order_quantity) : null,
      lead_time_days: body.lead_time_days != null ? Number(body.lead_time_days) : 0,
      preferred_vendor_id: (body.preferred_vendor_id as string) || null,
      is_active: true,
    };
    if (existing) {
      const { data, error } = await supabaseAdmin()
        .from('erp_replenishment_rules')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) return err('INTERNAL', error.message, 500);
      return NextResponse.json({ data });
    }
    const { data, error } = await supabaseAdmin()
      .from('erp_replenishment_rules')
      .insert(values)
      .select('*')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Rule save failed', 500);
  }
}
