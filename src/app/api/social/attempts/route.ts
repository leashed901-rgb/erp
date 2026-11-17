import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPostTarget, toPublishAttempt } from '@/lib/socialTypes';

/* Publish attempts (doc 23): a post's targets with their attempt
   history — the Queue's failure/retry evidence. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('postId');
  if (!postId) return err('VALIDATION', 'postId query param required', 400);
  const sb = supabaseAdmin();
  const { data: targets, error } = await sb
    .from('social_post_targets')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const targetRows = (targets || []) as Record<string, unknown>[];
  const ids = targetRows.map((t) => String(t.id));
  const attemptsByTarget = new Map<string, ReturnType<typeof toPublishAttempt>[]>();
  if (ids.length) {
    const { data: attempts } = await sb
      .from('social_publish_attempts')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('post_target_id', ids)
      .order('attempt_no', { ascending: true });
    for (const a of attempts || []) {
      const row = a as Record<string, unknown>;
      const key = String(row.post_target_id);
      if (!attemptsByTarget.has(key)) attemptsByTarget.set(key, []);
      attemptsByTarget.get(key)!.push(toPublishAttempt(row));
    }
  }
  return NextResponse.json({
    data: targetRows.map((t) => ({ target: toPostTarget(t), attempts: attemptsByTarget.get(String(t.id)) || [] })),
  });
}
