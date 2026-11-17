import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { loadPost, firstPartySellerId } from '@/lib/socialServer';

/* Publish retry (doc 23 gap: the publish-attempt retry loop).
   Failed targets go back to 'queued' with a fresh
   social_publish_attempts row recording the retry; failed network
   rows return to 'scheduled' and the post leaves 'failed'. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const post = await loadPost(id);
  if (!post) return err('NOT_FOUND', 'Post not found', 404);

  const { data: failedTargets } = await sb
    .from('social_post_targets')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('post_id', id)
    .eq('status', 'failed');
  const failedNetworks = post.networks.filter((n) => n.status === 'failed');
  if (!failedTargets?.length && !failedNetworks.length && post.status !== 'failed') {
    return err('CONFLICT', 'Nothing failed on this post — retry applies to failed publishes', 409);
  }

  const sellerId = await firstPartySellerId();
  let retried = 0;
  for (const t of failedTargets || []) {
    const targetId = String((t as Record<string, unknown>).id);
    const { data: prior } = await sb
      .from('social_publish_attempts')
      .select('attempt_no')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('post_target_id', targetId)
      .order('attempt_no', { ascending: false })
      .limit(1);
    const nextNo = prior?.length ? Number((prior[0] as Record<string, unknown>).attempt_no) + 1 : 1;
    if (sellerId) {
      const { error: attErr } = await sb.from('social_publish_attempts').insert({
        tenant_id: DEFAULT_TENANT_ID,
        post_target_id: targetId,
        seller_id: sellerId,
        attempt_no: nextNo,
        idempotency_key: `retry:${targetId}:${nextNo}`,
        result: 'retry_queued',
        started_at: new Date().toISOString(),
      });
      if (attErr) return err('INTERNAL', attErr.message, 500);
    }
    const { error: upErr } = await sb
      .from('social_post_targets')
      .update({ status: 'queued', error_code: null, error_message: null })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', targetId);
    if (upErr) return err('INTERNAL', upErr.message, 500);
    retried++;
  }

  if (failedNetworks.length) {
    const { error } = await sb
      .from('social_post_networks')
      .update({ status: 'scheduled', error: null })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('social_post_id', id)
      .eq('status', 'failed');
    if (error) return err('INTERNAL', error.message, 500);
  }
  if (post.status === 'failed') {
    await sb.from('social_posts').update({ status: 'scheduled', error: null }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  }

  const updated = await loadPost(id);
  return NextResponse.json({ data: { post: updated, targetsRetried: retried, networksRetried: failedNetworks.length } });
}
