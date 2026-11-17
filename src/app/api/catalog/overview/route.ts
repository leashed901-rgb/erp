import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * GET /api/catalog/overview — the six Catalog Overview KPI tiles
 * (kpis.md). Every value is a live count from the catalog tables.
 *
 * - Products / Published: products table.
 * - Low stock: erp_stock_levels rows whose available quantity
 *   (on_hand − reserved − allocated) is at or below zero. The doc says
 *   "below reorder point" but erp_stock_levels carries no reorder
 *   column; product_variants carries reorder_level, and no variant is
 *   flagged out of stock today (in_stock=false: 0) — available ≤ 0 is
 *   the honest low-stock signal on file.
 * - Avg margin %: product_variants.standard_cost (migration
 *   20261115000004) is the variance cost column — margin per variant is
 *   (price − standard_cost) / price, averaged over the variants that
 *   actually have a cost on file (price > 0 AND standard_cost > 0).
 *   Costed variants are read in 1,000-row pages (PostgREST caps a page
 *   at 1,000 — see the Batch H note). Uncosted variants (cost 0) are
 *   excluded, not treated as 100% margin. When no variant has a cost
 *   the tile is "—".
 * - Listings syncing: commerce_channel_products with sync_status in
 *   (syncing, failed).
 * - Blanks available: supplier_catalog_products not hidden.
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const [
      { count: products },
      { count: published },
      { data: levels },
      { count: syncing },
      { count: blanks },
    ] = await Promise.all([
      sb.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'published'),
      sb.from('erp_stock_levels').select('on_hand, reserved, allocated').eq('tenant_id', DEFAULT_TENANT_ID),
      sb.from('commerce_channel_products').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).in('sync_status', ['syncing', 'failed']),
      sb.from('supplier_catalog_products').select('id', { count: 'exact', head: true }).eq('is_hidden', false),
    ]);

    // Avg margin — page the costed variants (PostgREST 1,000-row cap).
    const margins: number[] = [];
    let from = 0;
    for (;;) {
      const { data: page } = await sb.from('product_variants')
        .select('price, standard_cost')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .gt('price', 0).gt('standard_cost', 0)
        .order('id', { ascending: true })
        .range(from, from + 999);
      for (const v of page || []) {
        margins.push((Number(v.price) - Number(v.standard_cost)) / Number(v.price));
      }
      if (!page || page.length < 1000) break;
      from += 1000;
    }

    const lowStock = (levels || []).filter(
      (l) => Number(l.on_hand || 0) - Number(l.reserved || 0) - Number(l.allocated || 0) <= 0,
    ).length;

    const avgMargin = margins.length
      ? `${(margins.reduce((a, b) => a + b, 0) / margins.length * 100).toFixed(1)}%`
      : '—';

    const fmt = (n: number | null) => (n ?? 0).toLocaleString('en-US');
    return NextResponse.json({
      data: {
        kpis: [
          { label: 'Products', value: fmt(products), screen: 'products' },
          { label: 'Published', value: fmt(published), screen: 'products' },
          { label: 'Low stock', value: fmt(lowStock), screen: 'variants' },
          { label: 'Avg margin %', value: avgMargin, screen: 'variants' },
          { label: 'Listings syncing', value: fmt(syncing), screen: 'listings' },
          { label: 'Blanks available', value: fmt(blanks), screen: 'catalog-sources--products' },
        ],
      },
    });
  } catch (e) {
    return err('LOAD_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}
