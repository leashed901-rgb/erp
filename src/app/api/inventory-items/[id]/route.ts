import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** GET /api/inventory-items/[id] — item + cost layers + moves + draws. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: item, error } = await supabaseAdmin()
    .from('acct_items')
    .select('*,acct_item_classifications(name,code)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !item) return err('NOT_FOUND', 'Item not found', 404);
  const r = item as Record<string, unknown>;
  const c = (r.acct_item_classifications ?? null) as { name?: string; code?: string } | null;
  const [{ data: layers }, { data: moves }] = await Promise.all([
    supabaseAdmin().from('acct_inventory_layers').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('item_id', id).order('layer_date', { ascending: true }),
    supabaseAdmin().from('acct_inventory_moves').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('item_id', id).order('move_date', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  // Draws must be scoped to THIS item's moves server-side. The old
  // code fetched the first 200 draws tenant-wide and filtered in JS —
  // once the tenant passed 200 draws (count sessions, reversals,
  // concurrent activity) a fresh draw fell outside the window and the
  // detail showed draws: [] while the layer was correct. .in() is
  // chunked to 100 — a .in() with 400+ ids silently fails.
  const moveIds = ((moves ?? []) as { id: string }[]).map((m) => m.id);
  const draws: Record<string, unknown>[] = [];
  for (let i = 0; i < moveIds.length; i += 100) {
    const { data: page } = await supabaseAdmin().from('acct_inventory_layer_draws')
      .select('*,acct_inventory_layers(layer_date)')
      .eq('tenant_id', DEFAULT_TENANT_ID).in('move_id', moveIds.slice(i, i + 100));
    draws.push(...((page ?? []) as Record<string, unknown>[]));
  }
  const itemDraws = draws;
  const onHand = ((moves ?? []) as { quantity: number }[]).reduce((s, m) => s + Number(m.quantity), 0);
  const layerValue = ((layers ?? []) as { qty_remaining: number; unit_cost: number }[])
    .reduce((s, l) => s + Number(l.qty_remaining) * Number(l.unit_cost), 0);
  let skuLabel: string | null = null;
  if (r.sku_id) {
    const { data: sku } = await supabaseAdmin().from('erp_product_skus').select('sku').eq('id', r.sku_id as string).maybeSingle();
    skuLabel = (sku as { sku?: string } | null)?.sku ?? null;
  }
  return NextResponse.json({
    data: {
      id: r.id,
      classificationId: r.classification_id,
      classificationName: c?.name ?? null,
      classificationCode: c?.code ?? null,
      itemType: r.item_type,
      name: r.name,
      sku: r.sku,
      skuId: r.sku_id,
      skuLabel,
      productId: r.product_id,
      catalogItemId: r.catalog_item_id,
      unitOfMeasure: r.unit_of_measure,
      isSold: r.is_sold,
      isPurchased: r.is_purchased,
      salesPrice: r.sales_price,
      purchaseCost: r.purchase_cost,
      lastUnitCost: r.last_unit_cost,
      incomeAccountId: r.income_account_id,
      expenseAccountId: r.expense_account_id,
      cogsAccountId: r.cogs_account_id,
      inventoryAssetAccountId: r.inventory_asset_account_id,
      preferredVendorId: r.preferred_vendor_id,
      reorderPoint: r.reorder_point,
      costingMethod: r.costing_method,
      isActive: r.is_active,
      onHand,
      layerValue: Math.round(layerValue * 100) / 100,
      createdAt: r.created_at,
      layers: ((layers ?? []) as Record<string, unknown>[]).map((l) => ({
        id: l.id, itemId: l.item_id, layerDate: l.layer_date, sourceMoveId: l.source_move_id,
        qtyIn: l.qty_in, qtyRemaining: l.qty_remaining, unitCost: l.unit_cost,
      })),
      moves: ((moves ?? []) as Record<string, unknown>[]).map((m) => ({
        id: m.id, itemId: m.item_id, moveDate: m.move_date, moveType: m.move_type,
        quantity: m.quantity, unitCost: m.unit_cost, totalCost: m.total_cost,
        sourceType: m.source_type, sourceId: m.source_id, reference: m.reference,
        reason: m.reason, journalEntryId: m.journal_entry_id,
      })),
      draws: itemDraws.map((d) => ({
        id: d.id,
        moveId: d.move_id,
        layerId: d.layer_id,
        layerDate: (d.acct_inventory_layers as { layer_date?: string } | null)?.layer_date ?? null,
        quantity: d.quantity,
        unitCost: d.unit_cost,
      })),
    },
  });
}

/**
 * PATCH /api/inventory-items/[id] — prices, accounts, reorder point,
 * active flag, descriptions. sku_id / item_type / classification are
 * immutable once the item has moves — the ledger history references
 * them; change them only on a fresh item (400 otherwise).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const { data: item } = await supabaseAdmin()
    .from('acct_items')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!item) return err('NOT_FOUND', 'Item not found', 404);
  const lockedFields = ['skuId', 'itemType', 'classificationId'];
  if (lockedFields.some((f) => f in body)) {
    const { count } = await supabaseAdmin()
      .from('acct_inventory_moves')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('item_id', id);
    if ((count ?? 0) > 0) {
      return err('VALIDATION', 'SKU, item type and classification cannot change once the item has ledger moves', 400);
    }
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Record<string, string> = {
    name: 'name', sku: 'sku', salesPrice: 'sales_price', purchaseCost: 'purchase_cost',
    incomeAccountId: 'income_account_id', expenseAccountId: 'expense_account_id',
    cogsAccountId: 'cogs_account_id', inventoryAssetAccountId: 'inventory_asset_account_id',
    preferredVendorId: 'preferred_vendor_id', reorderPoint: 'reorder_point',
    salesDescription: 'sales_description', purchaseDescription: 'purchase_description',
    isSold: 'is_sold', isPurchased: 'is_purchased', taxable: 'taxable', isActive: 'is_active',
    skuId: 'sku_id', itemType: 'item_type', classificationId: 'classification_id',
    unitOfMeasure: 'unit_of_measure',
  };
  for (const [bodyKey, col] of Object.entries(map)) {
    if (bodyKey in body) {
      updates[col] = ['salesPrice', 'purchaseCost', 'reorderPoint'].includes(bodyKey)
        ? num(body[bodyKey])
        : body[bodyKey];
    }
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_items')
    .update(updates)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data });
}
