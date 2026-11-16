import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/products/listings/map — the taxonomy map (`listing_category_map`):
 * which source categories / products / paths feed each listing category.
 */
export async function GET(req: NextRequest) {
  const nodeId = new URL(req.url).searchParams.get('node_id');
  let query = supabaseAdmin()
    .from('listing_category_map')
    .select('id,node_id,match_kind,source_category_id,supplier_id,source_path_prefix,catalog_product_id,rule,effect,include_descendants,priority,is_primary,status,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (nodeId) query = query.eq('node_id', nodeId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const nodeIds = [...new Set(rows.map((r) => r.node_id))];
  const productIds = [...new Set(rows.map((r) => r.catalog_product_id).filter(Boolean))];
  const [{ data: nodes }, { data: products }] = await Promise.all([
    supabaseAdmin().from('taxonomy_nodes').select('id,name,path').in('id', nodeIds.length ? nodeIds : ['00000000-0000-0000-0000-000000000000']),
    // catalog_product_id is a SUPPLIER catalog product (supplier_catalog_products),
    // not a storefront product — that is the FK target of the map table.
    supabaseAdmin().from('supplier_catalog_products').select('id,name').in('id', productIds.length ? (productIds as string[]) : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const nodeById = new Map(((nodes ?? []) as { id: string; name: string; path: string }[]).map((n) => [n.id, n]));
  const productById = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      node_name: nodeById.get(r.node_id)?.name ?? null,
      node_path: nodeById.get(r.node_id)?.path ?? null,
      product_name: r.catalog_product_id ? (productById.get(r.catalog_product_id) ?? null) : null,
    })),
  });
}

/**
 * POST /api/products/listings/map — map a source onto a listing category
 * (registry `listing.map` → `listing_map_category`).
 * Body: { node_id, source_category_id?, source_path?, supplier_id?,
 *         supplier_catalog_product_id?, rule?, effect?, include_descendants?,
 *         priority?, is_primary?, publish? }. At least one source is required
 * (the RPC enforces it). Publishes the node by default, which writes the
 * `product_taxonomy_links` rows.
 *
 * NOTE on product pins: `listing_category_map.catalog_product_id` references
 * `supplier_catalog_products` (the supplier's catalog), NOT the storefront
 * `products` table — a storefront product id fails the FK. Pass a supplier
 * catalog product id, or map by source path / source category instead (the
 * flow that covers the 3,600 POD products).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const nodeId = String(body.node_id || '');
  if (!nodeId) return err('VALIDATION', 'node_id is required', 400);
  if (body.product_id) {
    return err('VALIDATION', 'product_id is a storefront product id and cannot be pinned here — pass supplier_catalog_product_id (a supplier catalog product) or map by source_path instead', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('listing_map_category', {
    p_tenant: DEFAULT_TENANT_ID,
    p_node: nodeId,
    p_source_category: (body.source_category_id as string) || null,
    p_source_path: (body.source_path as string) || null,
    p_supplier: (body.supplier_id as string) || null,
    p_product: (body.supplier_catalog_product_id as string) || null,
    p_rule: (body.rule as Record<string, unknown>) ?? null,
    p_effect: (body.effect as string) || 'include',
    p_include_descendants: body.include_descendants !== false,
    p_priority: body.priority != null ? Number(body.priority) : 100,
    p_is_primary: !!body.is_primary,
    p_publish: body.publish !== false,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
