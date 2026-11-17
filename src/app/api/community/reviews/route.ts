import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/community/reviews?productId=&status=&limit=
 * POST /api/community/reviews — a shopper reviews a product.
 *
 * New reviews are created status 'pending' (the table defaults to
 * 'published' — never rely on the default). is_verified_purchase is
 * computed from the customer's real orders: an order (crm_customer_id)
 * with a line whose sku_id is one of the product's variants.
 * The ugc_counters_trg trigger refreshes ugc_product_counters on
 * INSERT/UPDATE/DELETE, so counters move without a manual refresh.
 */

const VALID_STATUS = ['pending', 'published', 'rejected'] as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function chunks<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function isVerifiedPurchase(customerId: string, productId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: variants } = await sb
    .from('product_variants')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('product_id', productId);
  const variantIds = (variants || []).map((v) => String(v.id));
  if (!variantIds.length) return false;
  const { data: orders } = await sb
    .from('erp_orders')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('crm_customer_id', customerId)
    .not('status', 'in', '("cancelled","draft")');
  const orderIds = (orders || []).map((o) => String(o.id));
  if (!orderIds.length) return false;
  for (const oChunk of chunks(orderIds)) {
    for (const vChunk of chunks(variantIds)) {
      const { data: lines } = await sb
        .from('erp_order_lines')
        .select('id')
        .in('order_id', oChunk)
        .in('sku_id', vChunk)
        .limit(1);
      if ((lines || []).length) return true;
    }
  }
  return false;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId');
    const status = url.searchParams.get('status');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100') || 100, 1), 500);
    let query = supabaseAdmin()
      .from('reviews')
      .select('id,product_id,customer_id,author_name,title,body,rating,status,is_verified_purchase,is_published,created_at,updated_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productId) query = query.eq('product_id', productId);
    if (status) {
      if (!(VALID_STATUS as readonly string[]).includes(status)) {
        return err('VALIDATION', `status must be one of ${VALID_STATUS.join(', ')}`);
      }
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err('VALIDATION', 'Invalid JSON body');
    const productId = String(body.productId || '');
    const rating = Number(body.rating);
    const title = typeof body.title === 'string' ? body.title.trim() : null;
    const reviewBody = typeof body.body === 'string' ? body.body.trim() : '';
    const customerId = typeof body.customerId === 'string' && body.customerId ? body.customerId : null;
    const authorName = typeof body.authorName === 'string' && body.authorName.trim()
      ? body.authorName.trim()
      : (customerId ? null : 'Guest');
    if (!productId) return err('VALIDATION', 'productId is required');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return err('VALIDATION', 'rating must be an integer between 1 and 5');
    }
    if (!reviewBody) return err('VALIDATION', 'body is required');
    // The product must exist — a review on a missing product is a 404, not a row.
    const { data: product, error: productErr } = await supabaseAdmin()
      .from('products')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', productId)
      .maybeSingle();
    if (productErr) return err('INTERNAL', productErr.message, 500);
    if (!product) return err('NOT_FOUND', `No product ${productId}`, 404);
    const verified = customerId ? await isVerifiedPurchase(customerId, productId) : false;
    const { data, error } = await supabaseAdmin()
      .from('reviews')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        product_id: productId,
        customer_id: customerId,
        author_name: authorName,
        title,
        body: reviewBody,
        rating,
        status: 'pending',
        is_verified_purchase: verified,
        is_published: false,
      })
      .select('id,product_id,customer_id,author_name,title,body,rating,status,is_verified_purchase,is_published,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
