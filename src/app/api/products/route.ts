import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * ── @platform/commands bridge — legacy direct-write ────────────────────────
 * This route is one of three designated "anchor" routes (parties,
 * crm/customers, products) where the data-access unification is documented.
 *
 * The canonical data-access path in the monorepo is:
 *   API route → @platform/commands (defineCommand registry) → @platform/db
 *   (typed RPC wrappers over p_* Postgres functions) → supabase
 * The command registry is the single source of truth for what the platform
 * does — every command is also surfaced to AI agents via apps/mcp-gateway.
 *
 * NEW routes should delegate to commands:
 *   import { getCommandContext, studio } from '@/lib/commands';
 *   const ctx = getCommandContext(reqUserId);
 *   const r = await studio.someCommand.run({...}, ctx);
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
 *
 * This route (and 138 others) currently calls supabaseAdmin().from('t')...
 * directly. That works (the staff app is single-tenant, service-role), but
 * it bypasses the registry — so the audit trail in platform_audit_log loses
 * the command id, and AI agents can't reach this mutation via MCP. Migrating
 * the 139 routes is a Phase 2 effort; this comment block establishes the
 * bridge so the migration has a clear target. Until then, this route stays
 * on the legacy direct-write path for backward compatibility.
 *
 * The bridge lives in apps/web/src/lib/commands.ts — `getCommandContext()`
 * builds `{ supabase, userId, tenantId }` from supabaseAdmin + DEFAULT_TENANT_ID
 * + the caller's user id. The studio/techpack/rfq/media command bundles are
 * re-exported from there so consumers don't need to learn a second import.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/products?q=&status=&limit=&offset=
 * The global Catalog products list. Real rows from the `products` table with
 * variant aggregates (count, price range) and order rollups (units, revenue)
 * computed from product_variants + order_items. This is the list the Catalog
 * domain's Products screen renders; every row opens the ProductProfile page.
 *
 * Pagination: `limit` (default 500, clamped 1..1000) and `offset` (default 0).
 * Response shape is unchanged: `{ data: rows }` — a page returns fewer than
 * `limit` rows when it is the last page. The product order is
 * (updated_at desc, id asc): the id tiebreak makes offset pagination
 * deterministic. Unordered offset paging over a large PostgREST table returns
 * unstable pages (the same query returning different rows), so every paged
 * fetch in this route carries an explicit ORDER BY.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const status = searchParams.get('status') || 'all';

  // Pagination params — defaults (500 / 0) preserve the old behavior exactly.
  const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
  const rawOffset = Number.parseInt(searchParams.get('offset') || '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 500;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  const sb = supabaseAdmin();

  let productsQuery = sb.from('products')
    .select('id,name,slug,description,short_description,status,category_id,brand,tags,is_featured,is_new,is_best_seller,is_house_favorite,fulfillment_type,created_at,updated_at,published_at,image,categories(id,name,slug)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true });
  // Status is pushed into the query so a filtered walk still pages over the
  // whole catalog; 'all' (the default) adds no filter, as before.
  if (status && status !== 'all') productsQuery = productsQuery.eq('status', status);
  // Search is pushed into the query too: the old code fetched one page and
  // filtered it in memory, so a search could only ever find products that
  // happened to be on the requested page (with 3,489 products, "White Mug"
  // returned nothing). ilike over name/brand/slug/description scans the
  // whole catalog; the in-memory pass below still adds tag matching on the
  // returned rows. Commas are stripped (they split PostgREST .or() terms)
  // and % / _ are escaped so they match literally.
  if (q) {
    const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, '');
    productsQuery = productsQuery.or(`name.ilike.%${esc}%,brand.ilike.%${esc}%,slug.ilike.%${esc}%,description.ilike.%${esc}%`);
  }

  const [productsRes, orderItemsRes] = await Promise.all([
    productsQuery.range(offset, offset + limit - 1),
    sb.from('order_items')
      .select('id,order_id,product_variant_id,quantity,unit_price')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('id', { ascending: true })
      .limit(2000),
  ]);

  if (productsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: productsRes.error.message } }, { status: 500 });
  }

  // Variants for exactly this page's products. The old code fetched the first
  // 2,000 variants tenant-wide with no order — with 160k variants the
  // per-product aggregates were wrong for most products. Fetch per page in
  // 100-id .in() chunks (long URLs get rejected), each chunk ordered
  // (product_id, id) and ranged in 1,000-row slices: PostgREST caps a single
  // response at 1,000 rows, and unordered offset paging is unstable.
  const pageIds = (productsRes.data || []).map((p: any) => p.id);
  const fetchVariantsFor = async (ids: string[]) => {
    const rows: any[] = [];
    let vOffset = 0;
    for (;;) {
      const { data, error } = await sb.from('product_variants')
        .select('id,product_id,sku,price,compare_at_price,is_active,status')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('product_id', ids)
        .order('product_id', { ascending: true })
        .order('id', { ascending: true })
        .range(vOffset, vOffset + 999);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < 1000) break;
      vOffset += 1000;
    }
    return rows;
  };
  const idChunks: string[][] = [];
  for (let i = 0; i < pageIds.length; i += 100) idChunks.push(pageIds.slice(i, i + 100));
  const variantRows = (await Promise.all(idChunks.map(fetchVariantsFor))).flat();

  // variant → product lookup + per-product aggregates
  const variantProduct = new Map<string, string>();
  const agg = new Map<string, { variant_count: number; active_variant_count: number; price_min: number | null; price_max: number | null }>();
  for (const v of variantRows) {
    variantProduct.set(v.id, v.product_id);
    const a = agg.get(v.product_id) || { variant_count: 0, active_variant_count: 0, price_min: null, price_max: null };
    a.variant_count++;
    if (v.is_active && v.status === 'active') a.active_variant_count++;
    // NULL price means the supplier gave no price (Printify catalog variants
    // carry none). Number(null) is 0, so a null must be skipped explicitly —
    // otherwise every Printify product would report a $0.00 price range.
    const p = v.price == null ? NaN : Number(v.price);
    if (!Number.isNaN(p)) {
      a.price_min = a.price_min == null ? p : Math.min(a.price_min, p);
      a.price_max = a.price_max == null ? p : Math.max(a.price_max, p);
    }
    agg.set(v.product_id, a);
  }

  // order rollups per product (via variant → order item)
  const sold = new Map<string, { units_sold: number; order_count: number; revenue: number; order_ids: Set<string> }>();
  for (const oi of (orderItemsRes.data || [])) {
    const pid = variantProduct.get(oi.product_variant_id);
    if (!pid) continue;
    const s = sold.get(pid) || { units_sold: 0, order_count: 0, revenue: 0, order_ids: new Set<string>() };
    s.units_sold += Number(oi.quantity) || 0;
    s.revenue += (Number(oi.quantity) || 0) * (Number(oi.unit_price) || 0);
    s.order_ids.add(oi.order_id);
    sold.set(pid, s);
  }

  let rows = (productsRes.data || []).map((p: any) => {
    const a = agg.get(p.id) || { variant_count: 0, active_variant_count: 0, price_min: null, price_max: null };
    const s = sold.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      short_description: p.short_description,
      status: p.status,
      category: p.categories ? { id: p.categories.id, name: p.categories.name, slug: p.categories.slug } : null,
      brand: p.brand,
      tags: p.tags || [],
      is_featured: p.is_featured,
      is_new: p.is_new,
      is_best_seller: p.is_best_seller,
      is_house_favorite: p.is_house_favorite,
      fulfillment_type: p.fulfillment_type,
      variant_count: a.variant_count,
      active_variant_count: a.active_variant_count,
      price_min: a.price_min,
      price_max: a.price_max,
      units_sold: s?.units_sold || 0,
      order_count: s?.order_ids.size || 0,
      revenue: +(s?.revenue || 0).toFixed(2),
      created_at: p.created_at,
      updated_at: p.updated_at,
      published_at: p.published_at,
      image: p.image,
    };
  });

  // Search filter — name, brand, slug, tags, description. The DB query
  // above already narrowed to matching rows across the whole catalog; this
  // in-memory pass only adds tag matching on the returned rows.
  if (q) {
    rows = rows.filter((r: any) =>
      [r.name, r.brand, r.slug, r.description, (r.tags || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }
  if (status && status !== 'all') {
    rows = rows.filter((r: any) => r.status === status);
  }

  return NextResponse.json({ data: rows });
}

/**
 * POST /api/products — create a catalog product.
 * Mirrors /api/parties POST: REQUIRED columns without defaults are resolved
 * here (slug dedup from name, tenant scoping).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const sb = supabaseAdmin();

  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required' } }, { status: 400 });
  }

  // slug: from name, deduped with a numeric suffix
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  const { data: existingSlugs } = await sb.from('products')
    .select('slug').eq('tenant_id', DEFAULT_TENANT_ID).like('slug', `${baseSlug}%`);
  const taken = new Set((existingSlugs || []).map((r: any) => r.slug));
  let slug = baseSlug;
  let n = 2;
  while (taken.has(slug)) slug = `${baseSlug}-${n++}`;

  // category_id must exist when provided
  if (body.category_id) {
    const { data: cat } = await sb.from('categories').select('id').eq('id', body.category_id).maybeSingle();
    if (!cat) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Unknown category_id' } }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    // products.id has no DB default — generate here.
    id: crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    name,
    slug,
    description: body.description ?? null,
    short_description: body.short_description ?? null,
    status: body.status || 'draft',
    category_id: body.category_id || null,
    brand: body.brand ?? null,
    tags: Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : null,
    is_featured: !!body.is_featured,
    is_new: !!body.is_new,
    is_best_seller: !!body.is_best_seller,
    is_house_favorite: !!body.is_house_favorite,
    fulfillment_type: body.fulfillment_type || 'stocked',
    supplier_id: body.supplier_id || null,
    preferred_supplier_id: body.preferred_supplier_id || null,
    income_account_id: body.income_account_id || null,
    cogs_account_id: body.cogs_account_id || null,
  };
  if (body.status === 'published') insert.published_at = new Date().toISOString();

  // A seller lists a product by setting created_by_seller_id (marketplace
  // journey): validate the seller exists for this tenant, else 400.
  if (body.created_by_seller_id) {
    const { data: seller } = await sb.from('sellers').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', body.created_by_seller_id).maybeSingle();
    if (!seller) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Unknown created_by_seller_id' } }, { status: 400 });
    insert.created_by_seller_id = body.created_by_seller_id;
  }

  const { data, error } = await sb.from('products').insert(insert).select('*').single();
  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
  }
  return NextResponse.json({ data });
}
