import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { findSkusForVariants } from '@/lib/erpStock';
import type { StockRecord } from '@/lib/erpTypes';

/**
 * GET /api/v1/inventory — the live inventory list (doc 16).
 * Only real stock: fulfillment_type = 'stocked' variants. POD
 * ('pod' / 'print_on_demand'), digital and supplier-fulfilled items never
 * show stock — they carry no on-hand number. On hand / reserved / available
 * come from the ERP stock ledger (`erp_stock_levels`, fed by the
 * `erp_inventory_movements` trigger) when a SKU has ledger rows; otherwise
 * the variant's own stock_quantity is the source. Reorder point comes from
 * `erp_replenishment_rules`; status is derived from the rule + on hand.
 *
 * The old version fetched every product then `.in()`-ed up to 1,000 product
 * ids into one variant query — the URL blew out and the query errored
 * silently, so the route returned zero rows even though products exist.
 * It now scopes to stocked products only and chunks every `.in()`.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const q = (params.get('q') || '').trim().toLowerCase();
    const warehouseFilter = params.get('warehouse') || 'all';
    const statusFilter = params.get('status') || 'all';
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(params.get('offset') ?? '0', 10) || 0, 0);
    const sb = supabaseAdmin();

    // Stocked products only — 4 of 3,609 products; the other 3,605 are POD.
    const stocked: { id: string; name: string; fulfillment_type: string | null; status: string }[] = [];
    let pOff = 0;
    for (;;) {
      const { data, error } = await sb
        .from('products')
        .select('id,name,fulfillment_type,status')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('fulfillment_type', 'stocked')
        .order('name', { ascending: true })
        .range(pOff, pOff + 999);
      if (error) throw new Error(error.message);
      stocked.push(...((data ?? []) as typeof stocked));
      if (!data || data.length < 1000) break;
      pOff += 1000;
    }
    const stockedIds = stocked.map((p) => p.id);
    const byProduct = new Map(stocked.map((p) => [p.id, p]));

    // Variants for the stocked products, in 100-id chunks.
    const variants: {
      id: string; product_id: string; sku: string | null; size: string | null;
      color: string | null; price: number | null; stock_quantity: number | null;
      reorder_level: number | null; is_active: boolean;
    }[] = [];
    for (let i = 0; i < stockedIds.length; i += 100) {
      const chunk = stockedIds.slice(i, i + 100);
      let vOff = 0;
      for (;;) {
        const { data, error } = await sb
          .from('product_variants')
          .select('id,product_id,sku,size,color,price,stock_quantity,reorder_level,is_active')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('product_id', chunk)
          .eq('is_active', true)
          .order('product_id', { ascending: true })
          .order('id', { ascending: true })
          .range(vOff, vOff + 999);
        if (error) throw new Error(error.message);
        variants.push(...((data ?? []) as typeof variants));
        if (!data || data.length < 1000) break;
        vOff += 1000;
      }
    }

    const variantIds = variants.map((v) => v.id);
    const skuByVariant = await findSkusForVariants(variantIds);
    const skuIds = [...new Set([...skuByVariant.values()].map((s) => s.id))];

    // Ledger levels per SKU (+warehouse), in 100-id chunks.
    const levels: { sku_id: string; warehouse_id: string; location_id: string | null; on_hand: number; reserved: number }[] = [];
    for (let i = 0; i < skuIds.length; i += 100) {
      const { data, error } = await sb
        .from('erp_stock_levels')
        .select('sku_id,warehouse_id,location_id,on_hand,reserved')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('sku_id', skuIds.slice(i, i + 100));
      if (error) throw new Error(`erp_stock_levels: ${error.message}`);
      levels.push(...((data ?? []) as typeof levels));
    }
    const levelsBySku = new Map<string, typeof levels>();
    for (const l of levels) {
      const arr = levelsBySku.get(l.sku_id) ?? [];
      arr.push(l);
      levelsBySku.set(l.sku_id, arr);
    }

    // Replenishment rules per SKU.
    const rulesBySku = new Map<string, { reorder_point: number; maximum_stock: number | null }>();
    if (skuIds.length > 0) {
      for (let i = 0; i < skuIds.length; i += 100) {
        const { data, error } = await sb
          .from('erp_replenishment_rules')
          .select('sku_id,reorder_point,maximum_stock')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('is_active', true)
          .in('sku_id', skuIds.slice(i, i + 100));
        if (error) throw new Error(`erp_replenishment_rules: ${error.message}`);
        for (const r of (data ?? []) as { sku_id: string; reorder_point: number; maximum_stock: number | null }[]) {
          rulesBySku.set(r.sku_id, r);
        }
      }
    }

    // Warehouses + locations for names / bin codes.
    const { data: whs } = await sb.from('erp_warehouses').select('id,name,code').eq('tenant_id', DEFAULT_TENANT_ID);
    const whById = new Map(((whs ?? []) as { id: string; name: string; code: string }[]).map((w) => [w.id, w]));
    const { data: locs } = await sb.from('erp_warehouse_locations').select('id,code').eq('tenant_id', DEFAULT_TENANT_ID);
    const locById = new Map(((locs ?? []) as { id: string; code: string }[]).map((l) => [l.id, l.code]));

    // Incoming PO quantities per SKU (open POs only).
    const incomingBySku = new Map<string, number>();
    const { data: openPos } = await sb
      .from('erp_purchase_orders')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('status', ['sent', 'approved', 'partially_received']);
    const poIds = ((openPos ?? []) as { id: string }[]).map((p) => p.id);
    if (poIds.length > 0) {
      for (let i = 0; i < poIds.length; i += 100) {
        const { data: lines } = await sb
          .from('erp_purchase_order_lines')
          .select('sku_id,quantity_ordered,quantity_received')
          .in('purchase_order_id', poIds.slice(i, i + 100));
        for (const l of (lines ?? []) as { sku_id: string | null; quantity_ordered: number; quantity_received: number }[]) {
          if (!l.sku_id) continue;
          incomingBySku.set(l.sku_id, (incomingBySku.get(l.sku_id) ?? 0) + Math.max(0, (l.quantity_ordered ?? 0) - (l.quantity_received ?? 0)));
        }
      }
    }

    const rows: StockRecord[] = [];
    const emittedSkuIds = new Set<string>();
    // erp_stock_levels can hold several rows for the same
    // (sku, warehouse, location) — the movement trigger writes a fresh
    // null-warehouse zero row per movement — so levels are aggregated
    // per bin before rows are emitted, and a zero null-warehouse group
    // is dropped when the SKU also has a real-warehouse group.
    const groupLevels = (raw: { warehouse_id: string; location_id: string | null; on_hand: number; reserved: number }[]) => {
      const byKey = new Map<string, { warehouse_id: string; location_id: string | null; on_hand: number; reserved: number }>();
      for (const l of raw) {
        const key = `${l.warehouse_id ?? ''}|${l.location_id ?? ''}`;
        const cur = byKey.get(key) ?? { warehouse_id: l.warehouse_id, location_id: l.location_id, on_hand: 0, reserved: 0 };
        cur.on_hand += Number(l.on_hand ?? 0);
        cur.reserved += Number(l.reserved ?? 0);
        byKey.set(key, cur);
      }
      const groups = [...byKey.values()];
      const hasReal = groups.some((g) => g.warehouse_id);
      return hasReal ? groups.filter((g) => g.warehouse_id || g.on_hand !== 0 || g.reserved !== 0) : groups;
    };
    for (const v of variants) {
      const p = byProduct.get(v.product_id);
      const sku = skuByVariant.get(v.id) ?? null;
      if (sku) emittedSkuIds.add(sku.id);
      const rule = sku ? rulesBySku.get(sku.id) : undefined;
      const reorderPoint = rule?.reorder_point ?? v.reorder_level ?? null;
      const skuLevels = sku ? groupLevels(levelsBySku.get(sku.id) ?? []) : [];
      const mkStatus = (onHand: number, available: number): StockRecord['status'] => {
        if (available < 0) return 'Negative';
        if (onHand <= 0) return 'Out of stock';
        if (reorderPoint != null && onHand <= reorderPoint) return 'Low stock';
        if (rule?.maximum_stock != null && onHand > rule.maximum_stock) return 'Overstock';
        return 'In stock';
      };
      const base = {
        variantId: v.id,
        productId: v.product_id,
        product: p?.name ?? 'Unknown product',
        sku: v.sku ?? '',
        skuId: sku?.id ?? null,
        size: v.size,
        color: v.color,
        price: v.price,
        fulfillmentType: p?.fulfillment_type ?? 'stocked',
        trackInventory: true,
        reorderPoint,
        incomingQty: sku ? (incomingBySku.get(sku.id) ?? 0) : 0,
      };
      if (skuLevels.length === 0) {
        const onHand = v.stock_quantity ?? 0;
        rows.push({
          ...base,
          warehouseId: null,
          warehouse: null,
          bin: null,
          onHand,
          reserved: 0,
          available: onHand,
          value: sku && sku.standard_cost > 0 ? Math.round(onHand * sku.standard_cost * 100) / 100 : null,
          stockSource: 'variant',
          status: mkStatus(onHand, onHand),
        });
      } else {
        for (const l of skuLevels) {
          const onHand = Number(l.on_hand ?? 0);
          const reserved = Number(l.reserved ?? 0);
          rows.push({
            ...base,
            warehouseId: l.warehouse_id,
            warehouse: whById.get(l.warehouse_id)?.name ?? null,
            bin: l.location_id ? (locById.get(l.location_id) ?? null) : null,
            onHand,
            reserved,
            available: onHand - reserved,
            value: sku && sku.standard_cost > 0 ? Math.round(onHand * sku.standard_cost * 100) / 100 : null,
            stockSource: 'ledger',
            status: mkStatus(onHand, onHand - reserved),
          });
        }
      }
    }

    // ERP-only SKUs: stock-keeping units that exist only in the ERP
    // master (no catalog variant — e.g. blank stock bought on POs).
    // They carry real on-hand in the ledger and belong in this list.
    {
      const { data: allSkus } = await sb
        .from('erp_product_skus')
        .select('id,sku,product_id,standard_cost')
        .eq('tenant_id', DEFAULT_TENANT_ID);
      const missing = ((allSkus ?? []) as { id: string; sku: string; product_id: string; standard_cost: number | null }[])
        .filter((s) => !emittedSkuIds.has(s.id));
      if (missing.length > 0) {
        const { data: lv } = await sb
          .from('erp_stock_levels')
          .select('sku_id,warehouse_id,location_id,on_hand,reserved')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('sku_id', missing.map((s) => s.id));
        const lvBySku = new Map<string, { warehouse_id: string; location_id: string | null; on_hand: number; reserved: number }[]>();
        for (const l of (lv ?? []) as { sku_id: string; warehouse_id: string; location_id: string | null; on_hand: number; reserved: number }[]) {
          const arr = lvBySku.get(l.sku_id) ?? [];
          arr.push(l);
          lvBySku.set(l.sku_id, arr);
        }
        const { data: erpProds } = await sb
          .from('erp_products')
          .select('id,name')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('id', missing.map((s) => s.product_id));
        const erpNameById = new Map(((erpProds ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
        for (const s of missing) {
          const groups = groupLevels(lvBySku.get(s.id) ?? []);
          if (groups.length === 0) continue;
          for (const l of groups) {
            const onHand = Number(l.on_hand ?? 0);
            const reserved = Number(l.reserved ?? 0);
            rows.push({
              variantId: s.id,
              productId: s.product_id,
              product: erpNameById.get(s.product_id) ?? 'ERP item',
              sku: s.sku,
              skuId: s.id,
              size: null,
              color: null,
              price: null,
              fulfillmentType: 'stocked',
              trackInventory: true,
              reorderPoint: null,
              incomingQty: incomingBySku.get(s.id) ?? 0,
              warehouseId: l.warehouse_id,
              warehouse: l.warehouse_id ? (whById.get(l.warehouse_id)?.name ?? null) : null,
              bin: l.location_id ? (locById.get(l.location_id) ?? null) : null,
              onHand,
              reserved,
              available: onHand - reserved,
              value: s.standard_cost && s.standard_cost > 0 ? Math.round(onHand * s.standard_cost * 100) / 100 : null,
              stockSource: 'ledger',
              status: onHand <= 0 ? 'Out of stock' : 'In stock',
            });
          }
        }
      }
    }

    let filtered = rows;
    if (q) filtered = filtered.filter((r) => r.sku.toLowerCase().includes(q) || r.product.toLowerCase().includes(q));
    if (warehouseFilter !== 'all') filtered = filtered.filter((r) => r.warehouseId === warehouseFilter);
    if (statusFilter !== 'all') filtered = filtered.filter((r) => r.status === statusFilter);

    const counts = {
      total: rows.length,
      inStock: rows.filter((r) => r.status === 'In stock').length,
      lowStock: rows.filter((r) => r.status === 'Low stock').length,
      outOfStock: rows.filter((r) => r.status === 'Out of stock').length,
      overstock: rows.filter((r) => r.status === 'Overstock').length,
      negative: rows.filter((r) => r.status === 'Negative').length,
      warehouses: whs?.length ?? 0,
    };
    return NextResponse.json({
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      counts,
      warehouses: (whs ?? []).map((w) => ({ id: w.id, name: w.name, code: w.code })),
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Failed to load inventory.');
  }
}
