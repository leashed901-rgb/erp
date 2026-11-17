import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/inventory/overview — spec-3 overview stat bar.
 *   Open POs .......... erp_purchase_orders not received-complete
 *   On order value .... open PO lines (ordered − received) × unit cost
 *   Inventory value ... acct_inventory_layers Σ qty_remaining × unit_cost
 *   Below reorder ..... stocked SKUs with on-hand ≤ reorder point (rule, else
 *                       the variant's reorder_level — same rule as the
 *                       /api/v1/inventory list's Low stock status)
 *   Receivings 7d ..... erp_goods_receipts received in the last 7 days.
 *                       (kpis-3 names acct_inventory_moves, but that table
 *                       holds no receipt moves — 'count'/'adjustment'/'sale'
 *                       only — so the goods-receipt table is the honest
 *                       source for "receivings".)
 *   Count variance .... Σ variance_value of the latest posted count session.
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Open POs + their open value.
    const { data: pos } = await sb
      .from('erp_purchase_orders')
      .select('id, status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .not('status', 'in', '("received","closed","cancelled","void")');
    const openPoIds = ((pos ?? []) as { id: string }[]).map((p) => p.id);
    let onOrderValue = 0;
    for (let i = 0; i < openPoIds.length; i += 100) {
      const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select('quantity_ordered, quantity, quantity_received, unit_cost')
        .in('purchase_order_id', openPoIds.slice(i, i + 100));
      for (const l of (lines ?? []) as { quantity_ordered: number | null; quantity: number | null; quantity_received: number | null; unit_cost: number | null }[]) {
        const open = Math.max(0, (l.quantity_ordered ?? l.quantity ?? 0) - (l.quantity_received ?? 0));
        onOrderValue += open * (l.unit_cost ?? 0);
      }
    }

    // Inventory value from the live finance layers (paged — the book is
    // past 1,000 rows in places; PostgREST caps pages at 1,000).
    let inventoryValue = 0;
    let off = 0;
    for (;;) {
      const { data, error } = await sb
        .from('acct_inventory_layers')
        .select('qty_remaining, unit_cost')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .gt('qty_remaining', 0)
        .order('id', { ascending: true })
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      for (const l of (data ?? []) as { qty_remaining: number; unit_cost: number }[]) {
        inventoryValue += Number(l.qty_remaining || 0) * Number(l.unit_cost || 0);
      }
      if (!data || data.length < 1000) break;
      off += 1000;
    }

    // Below reorder — mirror the /api/v1/inventory status rule.
    const stocked: { id: string }[] = [];
    let pOff = 0;
    for (;;) {
      const { data, error } = await sb
        .from('products')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('fulfillment_type', 'stocked')
        .order('id', { ascending: true })
        .range(pOff, pOff + 999);
      if (error) throw new Error(error.message);
      stocked.push(...((data ?? []) as { id: string }[]));
      if (!data || data.length < 1000) break;
      pOff += 1000;
    }
    let belowReorder = 0;
    if (stocked.length > 0) {
      const stockedIds = stocked.map((p) => p.id);
      const variants: { id: string; reorder_level: number | null }[] = [];
      for (let i = 0; i < stockedIds.length; i += 100) {
        const { data } = await sb
          .from('product_variants')
          .select('id,reorder_level')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('product_id', stockedIds.slice(i, i + 100))
          .eq('is_active', true);
        variants.push(...((data ?? []) as typeof variants));
      }
      // SKU per variant + levels + rules.
      const { findSkusForVariants } = await import('@/lib/erpStock');
      const skuByVariant = await findSkusForVariants(variants.map((v) => v.id));
      const skuIds = [...new Set([...skuByVariant.values()].map((s) => s.id))];
      const onHandBySku = new Map<string, number>();
      for (let i = 0; i < skuIds.length; i += 100) {
        const { data } = await sb
          .from('erp_stock_levels')
          .select('sku_id,on_hand')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('sku_id', skuIds.slice(i, i + 100));
        for (const l of (data ?? []) as { sku_id: string; on_hand: number }[]) {
          onHandBySku.set(l.sku_id, (onHandBySku.get(l.sku_id) ?? 0) + Number(l.on_hand || 0));
        }
      }
      const pointBySku = new Map<string, number>();
      for (let i = 0; i < skuIds.length; i += 100) {
        const { data } = await sb
          .from('erp_replenishment_rules')
          .select('sku_id,reorder_point')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('is_active', true)
          .in('sku_id', skuIds.slice(i, i + 100));
        for (const r of (data ?? []) as { sku_id: string; reorder_point: number }[]) {
          pointBySku.set(r.sku_id, Number(r.reorder_point));
        }
      }
      for (const v of variants) {
        const sku = skuByVariant.get(v.id);
        if (!sku) continue;
        const point = pointBySku.get(sku.id) ?? v.reorder_level;
        if (point == null) continue;
        if ((onHandBySku.get(sku.id) ?? 0) <= point) belowReorder += 1;
      }
    }

    // Receivings in the last 7 days.
    const { count: receivings7d } = await sb
      .from('erp_goods_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .gte('received_at', sevenDaysAgo);

    // Latest posted count session's variance.
    const { data: lastCount } = await sb
      .from('erp_inventory_count_sessions')
      .select('id, count_number, posted_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'posted')
      .not('posted_at', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(1);
    let countVariance: number | null = null;
    let countNumber: string | null = null;
    if (lastCount && lastCount.length > 0) {
      countNumber = lastCount[0].count_number;
      const { data: lines } = await sb
        .from('erp_inventory_count_lines')
        .select('variance_value')
        .eq('count_session_id', lastCount[0].id);
      countVariance = (lines ?? []).reduce((s, l: { variance_value: number | null }) => s + Number(l.variance_value || 0), 0);
    }

    return NextResponse.json({
      data: {
        kpis: {
          openPOs: openPoIds.length,
          onOrderValue: Math.round(onOrderValue * 100) / 100,
          inventoryValue: Math.round(inventoryValue * 100) / 100,
          belowReorder,
          receivings7d: receivings7d ?? 0,
          countVariance,
        },
        lastCount: countNumber ? { countNumber, variance: countVariance, postedAt: lastCount![0].posted_at } : null,
      },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Failed to load inventory overview.');
  }
}
