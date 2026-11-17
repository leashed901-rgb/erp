import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const ITEM_TYPES = ['inventory', 'non_inventory', 'service', 'bundle', 'gift_card', 'discount', 'other_charge'] as const;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function enrich(items: Record<string, unknown>[]) {
  const ids = items.map((i) => i.id as string);
  const onHand = new Map<string, number>();
  const layerValue = new Map<string, number>();
  if (ids.length > 0) {
    const { data: moves } = await supabaseAdmin()
      .from('acct_inventory_moves')
      .select('item_id,quantity')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('item_id', ids);
    for (const m of (moves ?? []) as { item_id: string; quantity: number }[]) {
      onHand.set(m.item_id, (onHand.get(m.item_id) ?? 0) + Number(m.quantity));
    }
    const { data: layers } = await supabaseAdmin()
      .from('acct_inventory_layers')
      .select('item_id,qty_remaining,unit_cost')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('item_id', ids);
    for (const l of (layers ?? []) as { item_id: string; qty_remaining: number; unit_cost: number }[]) {
      layerValue.set(l.item_id, (layerValue.get(l.item_id) ?? 0) + Number(l.qty_remaining) * Number(l.unit_cost));
    }
  }
  // ERP SKU labels for linked rows (sku_id → erp_product_skus.sku).
  const skuIds = [...new Set(items.map((i) => i.sku_id as string).filter(Boolean))];
  const skuLabel = new Map<string, string>();
  if (skuIds.length > 0) {
    const { data: skus } = await supabaseAdmin()
      .from('erp_product_skus')
      .select('id,sku')
      .in('id', skuIds);
    for (const s of (skus ?? []) as { id: string; sku: string }[]) skuLabel.set(s.id, s.sku);
  }
  return { onHand, layerValue, skuLabel };
}

function toDto(
  r: Record<string, unknown>,
  onHand: Map<string, number>,
  layerValue: Map<string, number>,
  skuLabel: Map<string, string>,
) {
  const c = (r.acct_item_classifications ?? null) as { name?: string; code?: string } | null;
  return {
    id: r.id,
    classificationId: r.classification_id,
    classificationName: c?.name ?? null,
    classificationCode: c?.code ?? null,
    itemType: r.item_type,
    name: r.name,
    sku: r.sku,
    skuId: r.sku_id,
    skuLabel: (r.sku_id as string) ? (skuLabel.get(r.sku_id as string) ?? null) : null,
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
    onHand: onHand.get(r.id as string) ?? 0,
    layerValue: Math.round((layerValue.get(r.id as string) ?? 0) * 100) / 100,
    createdAt: r.created_at,
  };
}

/** GET /api/inventory-items — finance item master (Batch F). */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  let query = supabaseAdmin()
    .from('acct_items')
    .select('*,acct_item_classifications(name,code)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true });
  if (q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const { onHand, layerValue, skuLabel } = await enrich(rows);
  return NextResponse.json({ data: rows.map((r) => toDto(r, onHand, layerValue, skuLabel)) });
}

/**
 * POST /api/inventory-items — create a finance item. costing_method is
 * forced to 'fifo' (the DB CHECK allows nothing else). For an inventory
 * item the asset account defaults to the inventory_asset role account
 * when the caller does not send one. quantity_on_hand starts at 0 —
 * on-hand is the sum of acct_inventory_moves, and the first stock comes
 * from an adjustment (or a count post), never from typing a number here.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  const classificationId = String(body.classificationId || '');
  const itemType = String(body.itemType || 'inventory');
  const uom = String(body.unitOfMeasure || 'each').trim();
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!classificationId) return err('VALIDATION', 'classificationId is required', 400);
  if (!(ITEM_TYPES as readonly string[]).includes(itemType)) {
    return err('VALIDATION', `itemType must be one of: ${ITEM_TYPES.join(', ')}`, 400);
  }
  const { data: cls } = await supabaseAdmin()
    .from('acct_item_classifications')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', classificationId)
    .maybeSingle();
  if (!cls) return err('VALIDATION', 'classification not found', 400);
  const { data: entityId } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  let assetAccountId = (body.inventoryAssetAccountId as string) || null;
  if (!assetAccountId && itemType === 'inventory') {
    const { data: roleAcct } = await supabaseAdmin().rpc('acct_role_account', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_entity_id: entityId,
      p_role: 'inventory_asset',
    });
    assetAccountId = (roleAcct as string) || null;
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    classification_id: classificationId,
    item_type: itemType,
    name,
    sku: (body.sku as string) || null,
    category_account_id: (body.categoryAccountId as string) || null,
    unit_of_measure: uom,
    is_sold: body.isSold !== false,
    sales_description: (body.salesDescription as string) || null,
    sales_price: num(body.salesPrice),
    income_account_id: (body.incomeAccountId as string) || null,
    taxable: body.taxable === true,
    is_purchased: body.isPurchased !== false,
    purchase_description: (body.purchaseDescription as string) || null,
    purchase_cost: num(body.purchaseCost),
    expense_account_id: (body.expenseAccountId as string) || null,
    preferred_vendor_id: (body.preferredVendorId as string) || null,
    inventory_asset_account_id: assetAccountId,
    cogs_account_id: (body.cogsAccountId as string) || null,
    quantity_on_hand: 0,
    reorder_point: num(body.reorderPoint),
    catalog_item_id: (body.catalogItemId as string) || null,
    product_id: (body.productId as string) || null,
    sku_id: (body.skuId as string) || null,
    product_variant_id: (body.productVariantId as string) || null,
    costing_method: 'fifo',
    is_active: body.isActive !== false,
  };
  const { data, error } = await supabaseAdmin()
    .from('acct_items')
    .insert(insert)
    .select('*,acct_item_classifications(name,code)')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  const { onHand, layerValue, skuLabel } = await enrich([data as Record<string, unknown>]);
  return NextResponse.json({ data: toDto(data as Record<string, unknown>, onHand, layerValue, skuLabel) }, { status: 201 });
}
