import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/community/comments?postId=&productId=&reviewId=&status=&limit=
 * POST /api/community/comments — a comment on a post, product or review.
 *
 * The table requires exactly one parent (product_id OR post_id OR
 * review_id — ugc_comments_has_parent CHECK) and customer_id, and
 * body is 1–2000 chars. New comments are created status 'published'
 * (the table default) unless the caller passes status 'hidden'.
 * The ugc_counters_trg trigger refreshes ugc_product_counters on
 * INSERT/UPDATE/DELETE.
 */

const VALID_STATUS = ['published', 'hidden', 'removed'] as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const postId = url.searchParams.get('postId');
    const productId = url.searchParams.get('productId');
    const reviewId = url.searchParams.get('reviewId');
    const status = url.searchParams.get('status');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100') || 100, 1), 500);
    let query = supabaseAdmin()
      .from('ugc_comments')
      .select('id,post_id,product_id,review_id,parent_id,customer_id,author_display_name,author_role,kind,body,status,moderation_reason,created_at,updated_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (postId) query = query.eq('post_id', postId);
    if (productId) query = query.eq('product_id', productId);
    if (reviewId) query = query.eq('review_id', reviewId);
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
    const customerId = String(body.customerId || '');
    const commentBody = typeof body.body === 'string' ? body.body.trim() : '';
    const postId = typeof body.postId === 'string' && body.postId ? body.postId : null;
    const productId = typeof body.productId === 'string' && body.productId ? body.productId : null;
    const reviewId = typeof body.reviewId === 'string' && body.reviewId ? body.reviewId : null;
    const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
    const kind = typeof body.kind === 'string' ? body.kind : 'comment';
    const authorRole = typeof body.authorRole === 'string' ? body.authorRole : 'customer';
    const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : null;
    if (!customerId) return err('VALIDATION', 'customerId is required');
    if (!commentBody) return err('VALIDATION', 'body is required');
    if (commentBody.length > 2000) return err('VALIDATION', 'body must be 2000 characters or fewer');
    if (!postId && !productId && !reviewId) {
      return err('VALIDATION', 'one of postId, productId or reviewId is required');
    }
    if (!['comment', 'question', 'tip'].includes(kind)) {
      return err('VALIDATION', "kind must be 'comment', 'question' or 'tip'");
    }
    if (!['customer', 'seller', 'staff'].includes(authorRole)) {
      return err('VALIDATION', "authorRole must be 'customer', 'seller' or 'staff'");
    }
    const { data, error } = await supabaseAdmin()
      .from('ugc_comments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_id: customerId,
        post_id: postId,
        product_id: productId,
        review_id: reviewId,
        parent_id: parentId,
        kind,
        author_role: authorRole,
        author_display_name: authorName,
        body: commentBody,
        status: 'published',
      })
      .select('id,post_id,product_id,review_id,customer_id,author_display_name,author_role,kind,body,status,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
