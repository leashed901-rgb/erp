import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * One moderation action on one submission. Approve publishes through the
 * same state the storefront reads (reviews.is_published / status, and
 * seller_social_posts.status = 'published' per the design contract);
 * reject and flag move the row to the matching queue state.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { source?: string; id?: string; action?: string } | null;
  if (!body?.id || !body?.source || !['approve', 'reject', 'flag'].includes(body.action || '')) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'source, id and action (approve|reject|flag) are required' } }, { status: 400 });
  }
  const db = supabaseAdmin();
  try {
    if (body.source === 'review') {
      const patch = body.action === 'approve'
        ? { status: 'published', is_published: true }
        : body.action === 'reject'
          ? { status: 'rejected', is_published: false }
          : { status: 'flagged', is_published: false };
      const { data, error } = await db.from('reviews').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', body.id).select('id, status, is_published').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Review not found' } }, { status: 404 });
      return NextResponse.json({ data });
    }
    if (body.source === 'social') {
      const status = body.action === 'approve' ? 'published' : body.action === 'reject' ? 'rejected' : 'flagged';
      const { data, error } = await db.from('seller_social_posts').update({ status }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', body.id).select('id, status').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, { status: 404 });
      return NextResponse.json({ data });
    }
    return NextResponse.json({ error: { code: 'BAD_SOURCE', message: 'Unknown source' } }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: { code: 'UGC_MODERATE_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
