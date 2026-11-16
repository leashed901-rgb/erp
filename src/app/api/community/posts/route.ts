import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/community/posts?productId=&status=&limit=
 * POST /api/community/posts — a community post (UGC feed).
 *
 * New posts are created status 'pending'. customer_id and product_id
 * are required by the table (a post always has an author and a
 * product context). The ugc_counters_trg trigger refreshes
 * ugc_product_counters on INSERT/UPDATE/DELETE.
 */

const VALID_STATUS = ['pending', 'published', 'rejected', 'removed'] as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId');
    const status = url.searchParams.get('status');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100') || 100, 1), 500);
    let query = supabaseAdmin()
      .from('ugc_posts')
      .select('id,product_id,customer_id,author_display_name,title,body,rating,status,is_verified_purchase,moderation_reason,moderated_at,published_at,created_at,updated_at')
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
    const customerId = String(body.customerId || '');
    const postBody = typeof body.body === 'string' ? body.body.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : null;
    const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : null;
    const rating = body.rating === undefined || body.rating === null ? null : Number(body.rating);
    if (!productId) return err('VALIDATION', 'productId is required');
    if (!customerId) return err('VALIDATION', 'customerId is required');
    if (!postBody) return err('VALIDATION', 'body is required');
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return err('VALIDATION', 'rating must be an integer between 1 and 5 when given');
    }
    const { data: product, error: productErr } = await supabaseAdmin()
      .from('products')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', productId)
      .maybeSingle();
    if (productErr) return err('INTERNAL', productErr.message, 500);
    if (!product) return err('NOT_FOUND', `No product ${productId}`, 404);
    const { data, error } = await supabaseAdmin()
      .from('ugc_posts')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        product_id: productId,
        customer_id: customerId,
        author_display_name: authorName,
        title,
        body: postBody,
        rating,
        status: 'pending',
      })
      .select('id,product_id,customer_id,author_display_name,title,body,rating,status,is_verified_purchase,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
