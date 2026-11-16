import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveOrCreateSku } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/adjust — adjust stock (doc 16, registry
 * `inventory.adjust` → `erp_adjust_stock`).
 * Body: { variant_id, qty_change, reason, warehouse_id?, location_id?,
 *         unit_cost? }. The variant is resolved to its ERP SKU (provisioned
 * from the real variant when missing), then the RPC writes the movement and
 * the ledger trigger updates `erp_stock_levels`. A reason is required — the
 * RPC raises without one. Returns the movement id + the SKU's new on-hand.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const variantId = String(body.variant_id || '');
  const qtyChange = Number(body.qty_change);
  const reason = String(body.reason || '').trim();
  if (!variantId) return err('VALIDATION', 'variant_id is required', 400);
  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    return err('VALIDATION', 'qty_change must be a non-zero number', 400);
  }
  if (!reason) return err('VALIDATION', 'reason is required for stock adjustments', 400);
  try {
    const sku = await resolveOrCreateSku(variantId);
    const { data: moveId, error } = await supabaseAdmin().rpc('erp_adjust_stock', {
      p_sku_id: sku.id,
      p_qty_change: qtyChange,
      p_reason: reason,
      p_warehouse_id: (body.warehouse_id as string) || null,
      p_location_id: (body.location_id as string) || null,
      p_unit_cost: body.unit_cost != null ? Number(body.unit_cost) : null,
    });
    if (error) return err('INTERNAL', error.message, 500);
    // New on-hand for the SKU (across warehouses).
    const { data: levels } = await supabaseAdmin()
      .from('erp_stock_levels')
      .select('on_hand')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('sku_id', sku.id);
    const onHand = (levels ?? []).reduce((s, l) => s + Number(l.on_hand ?? 0), 0);
    return NextResponse.json({ data: { movement_id: moveId, sku_id: sku.id, sku: sku.sku, on_hand: onHand } });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Adjustment failed', 500);
  }
}
