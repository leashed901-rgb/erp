import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/community/posts/[id]/moderate { action: 'publish' | 'reject' | 'remove', reason?, staffId? }
 *
 * publish → status published + published_at now.
 * reject / remove → status rejected / removed, moderation_reason +
 * moderated_by/at stamped. reason is required for reject and remove.
 * The ugc_counters_trg trigger re-aggregates the product counters
 * on the status change.
 */

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err('VALIDATION', 'Invalid JSON body');
    const action = String(body.action || '');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const staffId = typeof body.staffId === 'string' && body.staffId ? body.staffId : null;
    if (!['publish', 'reject', 'remove'].includes(action)) {
      return err('VALIDATION', "action must be 'publish', 'reject' or 'remove'");
    }
    if (action !== 'publish' && !reason) {
      return err('VALIDATION', 'reason is required when rejecting or removing a post');
    }
    const sb = supabaseAdmin();
    const { data: post, error: readErr } = await sb
      .from('ugc_posts')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (readErr) return err('INTERNAL', readErr.message, 500);
    if (!post) return err('NOT_FOUND', `No post ${id}`, 404);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (action === 'publish') {
      patch.status = 'published';
      patch.published_at = now;
      patch.moderation_reason = null;
    } else {
      patch.status = action === 'reject' ? 'rejected' : 'removed';
      patch.moderation_reason = reason;
      patch.moderated_by = staffId;
      patch.moderated_at = now;
    }
    const { data, error } = await sb
      .from('ugc_posts')
      .update(patch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,product_id,customer_id,author_display_name,title,body,rating,status,is_verified_purchase,moderation_reason,moderated_at,published_at,created_at,updated_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
