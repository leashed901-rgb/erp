import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { findSkuForVariant } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/inventory/[itemId]/history — stock history for an item
 * (doc 16, registry `inventory.history` → `erp_stock_history`).
 * The old version filtered `erp_inventory_movements` by `item_id` — a column
 * that table does not have — so it errored on every call. The item id here
 * is a catalog variant id (or an ERP SKU id); it is resolved to the ERP SKU
 * and the RPC returns the movement ledger with a running on-hand balance.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const from = new URL(req.url).searchParams.get('from') || null;
  try {
    // itemId may already be an ERP SKU id.
    const { data: direct } = await supabaseAdmin()
      .from('erp_product_skus')
      .select('id, sku')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', itemId)
      .maybeSingle();
    const sku = direct ?? (await findSkuForVariant(itemId));
    if (!sku) {
      return NextResponse.json({ data: [], sku_id: null, note: 'No ERP SKU exists for this variant yet — adjust stock once to provision it.' });
    }
    const { data, error } = await supabaseAdmin().rpc('erp_stock_history', {
      p_sku_id: sku.id,
      p_from: from,
    });
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({
      data: (data ?? []).map((m: {
        occurred_at: string; movement_type: string; warehouse: string | null;
        quantity: number; running_on_hand: number; unit_cost: number | null;
        source_type: string | null; reference: string | null; reason: string | null;
        affects_stock: boolean;
      }, idx: number) => ({
        // camelCase — this is the StockMovement shape the screen reads.
        // The RPC returns snake_case columns; do not pass them through raw.
        id: `${m.occurred_at}-${idx}`,
        occurredAt: m.occurred_at,
        movementType: m.movement_type,
        warehouse: m.warehouse,
        quantity: Number(m.quantity),
        runningOnHand: Number(m.running_on_hand),
        unitCost: m.unit_cost,
        sourceType: m.source_type,
        reference: m.reference,
        reason: m.reason,
        affectsStock: m.affects_stock,
      })),
      sku_id: sku.id,
      sku: sku.sku,
    });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Failed to load stock history.', 500);
  }
}
