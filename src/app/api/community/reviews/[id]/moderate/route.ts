import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/community/reviews/[id]/moderate { action: 'publish' | 'reject', reason?, staffId? }
 *
 * publish → status published, is_published true.
 * reject → status rejected, is_published false, and the removal reason
 * is logged as a ugc_reports row (target_type 'review', status
 * 'actioned') — reviews has no moderation_reason column, so the
 * report row IS the audit trail. reason is required for reject.
 * The ugc_counters_trg trigger re-aggregates the product counters
 * on the status change, so published counts move immediately.
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
    if (!['publish', 'reject'].includes(action)) {
      return err('VALIDATION', "action must be 'publish' or 'reject'");
    }
    if (action === 'reject' && !reason) {
      return err('VALIDATION', 'reason is required when rejecting a review');
    }
    const sb = supabaseAdmin();
    const { data: review, error: readErr } = await sb
      .from('reviews')
      .select('id,product_id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (readErr) return err('INTERNAL', readErr.message, 500);
    if (!review) return err('NOT_FOUND', `No review ${id}`, 404);
    const { data, error } = await sb
      .from('reviews')
      .update({
        status: action === 'publish' ? 'published' : 'rejected',
        is_published: action === 'publish',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,product_id,customer_id,author_name,title,body,rating,status,is_verified_purchase,is_published,created_at,updated_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    if (action === 'reject') {
      const { error: reportErr } = await sb.from('ugc_reports').insert({
        tenant_id: DEFAULT_TENANT_ID,
        reporter_customer_id: null,
        target_type: 'review',
        target_id: id,
        reason,
        details: 'Review rejected by staff moderation.',
        status: 'actioned',
        reviewed_by: staffId,
        reviewed_at: new Date().toISOString(),
      });
      if (reportErr) return err('INTERNAL', `Review rejected but the removal reason could not be logged: ${reportErr.message}`, 500);
    }
    return NextResponse.json({ data });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
