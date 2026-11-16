import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/community/reports?status=&targetType=&limit= — the moderation queue.
 * POST /api/community/reports — file a report on a post, review,
 * comment or media. The target must exist (a report on a missing
 * row is a 404). reporter_customer_id is optional (anonymous report).
 * Filing a report does NOT hide the target — staff act on it from
 * the queue (see /reports/[id]/action).
 */

const VALID_STATUS = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
const VALID_TARGETS = ['post', 'review', 'comment', 'media'] as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const TARGET_TABLE: Record<string, string> = {
  post: 'ugc_posts',
  review: 'reviews',
  comment: 'ugc_comments',
  media: 'ugc_media',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const targetType = url.searchParams.get('targetType');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100') || 100, 1), 500);
    let query = supabaseAdmin()
      .from('ugc_reports')
      .select('id,reporter_customer_id,target_type,target_id,reason,details,status,reviewed_by,reviewed_at,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) {
      if (!(VALID_STATUS as readonly string[]).includes(status)) {
        return err('VALIDATION', `status must be one of ${VALID_STATUS.join(', ')}`);
      }
      query = query.eq('status', status);
    }
    if (targetType) {
      if (!(VALID_TARGETS as readonly string[]).includes(targetType)) {
        return err('VALIDATION', `targetType must be one of ${VALID_TARGETS.join(', ')}`);
      }
      query = query.eq('target_type', targetType);
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
    const targetType = String(body.targetType || '');
    const targetId = String(body.targetId || '');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim() : null;
    const reporterId = typeof body.reporterCustomerId === 'string' && body.reporterCustomerId
      ? body.reporterCustomerId
      : null;
    if (!(VALID_TARGETS as readonly string[]).includes(targetType)) {
      return err('VALIDATION', `targetType must be one of ${VALID_TARGETS.join(', ')}`);
    }
    if (!targetId) return err('VALIDATION', 'targetId is required');
    if (!reason) return err('VALIDATION', 'reason is required');
    const { data: target, error: targetErr } = await supabaseAdmin()
      .from(TARGET_TABLE[targetType])
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', targetId)
      .maybeSingle();
    if (targetErr) return err('INTERNAL', targetErr.message, 500);
    if (!target) return err('NOT_FOUND', `No ${targetType} ${targetId}`, 404);
    const { data, error } = await supabaseAdmin()
      .from('ugc_reports')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        reporter_customer_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
        details,
        status: 'open',
      })
      .select('id,reporter_customer_id,target_type,target_id,reason,details,status,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
