import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/community/comments/[id]/moderate { action: 'publish' | 'hide' | 'remove', reason?, staffId? }
 *
 * publish → status published (clears the moderation reason).
 * hide / remove → status hidden / removed with moderation_reason
 * stamped. reason is required for hide and remove.
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
    if (!['publish', 'hide', 'remove'].includes(action)) {
      return err('VALIDATION', "action must be 'publish', 'hide' or 'remove'");
    }
    if (action !== 'publish' && !reason) {
      return err('VALIDATION', 'reason is required when hiding or removing a comment');
    }
    const sb = supabaseAdmin();
    const { data: comment, error: readErr } = await sb
      .from('ugc_comments')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (readErr) return err('INTERNAL', readErr.message, 500);
    if (!comment) return err('NOT_FOUND', `No comment ${id}`, 404);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === 'publish') {
      patch.status = 'published';
      patch.moderation_reason = null;
    } else {
      patch.status = action === 'hide' ? 'hidden' : 'removed';
      patch.moderation_reason = reason;
    }
    const { data, error } = await sb
      .from('ugc_comments')
      .update(patch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,post_id,product_id,review_id,customer_id,author_display_name,author_role,kind,body,status,moderation_reason,created_at,updated_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
