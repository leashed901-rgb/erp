import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/community/reports/[id]/action
 *   { action: 'reviewing' | 'actioned' | 'dismissed', staffId?, targetAction?, reason? }
 *
 * Moves a moderation-queue entry. 'actioned' / 'dismissed' stamp
 * reviewed_by/at. targetAction (optional, only with 'actioned')
 * applies the moderation outcome to the reported content in the
 * same call:
 *   post    → 'remove' (status removed) or 'reject' (status rejected)
 *   review  → 'reject' (status rejected; the report row itself is
 *              the removal-reason record)
 *   comment → 'hide' (status hidden) or 'remove' (status removed)
 *   media   → 'remove' (status removed)
 * reason is required whenever targetAction is given (it becomes the
 * target's moderation_reason where the table has one).
 */

const TARGET_STATUS: Record<string, Record<string, { table: string; status: string; reasonColumn: boolean; moderatedColumns: boolean }>> = {
  post: {
    remove: { table: 'ugc_posts', status: 'removed', reasonColumn: true, moderatedColumns: true },
    reject: { table: 'ugc_posts', status: 'rejected', reasonColumn: true, moderatedColumns: true },
  },
  review: {
    reject: { table: 'reviews', status: 'rejected', reasonColumn: false, moderatedColumns: false },
  },
  comment: {
    hide: { table: 'ugc_comments', status: 'hidden', reasonColumn: true, moderatedColumns: false },
    remove: { table: 'ugc_comments', status: 'removed', reasonColumn: true, moderatedColumns: false },
  },
  media: {
    remove: { table: 'ugc_media', status: 'removed', reasonColumn: true, moderatedColumns: false },
  },
};

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err('VALIDATION', 'Invalid JSON body');
    const action = String(body.action || '');
    const targetAction = typeof body.targetAction === 'string' ? body.targetAction : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const staffId = typeof body.staffId === 'string' && body.staffId ? body.staffId : null;
    if (!['reviewing', 'actioned', 'dismissed'].includes(action)) {
      return err('VALIDATION', "action must be 'reviewing', 'actioned' or 'dismissed'");
    }
    if (targetAction && action !== 'actioned') {
      return err('VALIDATION', 'targetAction is only valid with action actioned');
    }
    if (targetAction && !reason) {
      return err('VALIDATION', 'reason is required when a targetAction is given');
    }
    const sb = supabaseAdmin();
    const { data: report, error: readErr } = await sb
      .from('ugc_reports')
      .select('id,target_type,target_id,status,reviewed_by,reviewed_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (readErr) return err('INTERNAL', readErr.message, 500);
    if (!report) return err('NOT_FOUND', `No report ${id}`, 404);
    if (targetAction) {
      const mapping = TARGET_STATUS[report.target_type]?.[targetAction];
      if (!mapping) {
        return err('VALIDATION', `targetAction '${targetAction}' is not valid for a ${report.target_type}`);
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: mapping.status, updated_at: now };
      if (mapping.reasonColumn) {
        patch.moderation_reason = reason;
      }
      // Only ugc_posts carries moderated_by/at — ugc_comments and
      // ugc_media have moderation_reason but no moderated_* columns
      // (writing them 500s on the schema cache).
      if (mapping.moderatedColumns) {
        patch.moderated_at = now;
        patch.moderated_by = staffId;
      }
      if (report.target_type === 'review') {
        // reviews has no moderation columns; the report row is the record.
        patch.is_published = false;
      }
      const { error: targetErr } = await sb
        .from(mapping.table)
        .update(patch)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', report.target_id);
      if (targetErr) return err('INTERNAL', targetErr.message, 500);
    }
    const now = new Date().toISOString();
    const reportPatch: Record<string, unknown> = { status: action };
    if (action !== 'reviewing') {
      reportPatch.reviewed_by = staffId;
      reportPatch.reviewed_at = now;
    }
    const { data, error } = await sb
      .from('ugc_reports')
      .update(reportPatch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,reporter_customer_id,target_type,target_id,reason,details,status,reviewed_by,reviewed_at,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
