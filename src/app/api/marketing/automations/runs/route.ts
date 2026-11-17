import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Automation runs (doc 23: Automation). The runs table is the immutable
   execution log — one row per workflow action step that fired. Nothing
   writes it yet (no automation worker / event source exists), so this
   returns real rows (currently none) plus per-workflow aggregates the
   screen renders as runs (7d), success %, and last run. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

function resultOf(status: string): 'Success' | 'Failed' | 'Pending' {
  const s = (status || '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'succeeded' || s === 'sent') return 'Success';
  if (s === 'failed' || s === 'error') return 'Failed';
  return 'Pending';
}

export async function GET(req: NextRequest) {
  const sb = supabaseAdmin();
  const workflowId = req.nextUrl.searchParams.get('workflowId');
  let query = sb
    .from('crm_automation_runs')
    .select('id, workflow_id, enrollment_id, action_type, status, scheduled_for, executed_at, result, error_message, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(500);
  if (workflowId) query = query.eq('workflow_id', workflowId);
  const { data: runs, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);

  const { data: flows } = await sb
    .from('crm_automation_workflows')
    .select('id, name')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const names = new Map(((flows || []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stats: Record<string, { runs7d: number; success: number; lastRun: string | null }> = {};
  for (const r of (runs || []) as Record<string, unknown>[]) {
    const wid = String(r.workflow_id || '');
    if (!stats[wid]) stats[wid] = { runs7d: 0, success: 0, lastRun: null };
    const created = new Date(String(r.created_at || '')).getTime();
    if (created >= sevenDaysAgo) stats[wid].runs7d++;
    if (resultOf(String(r.status || '')) === 'Success') stats[wid].success++;
    if (!stats[wid].lastRun || created > new Date(stats[wid].lastRun as string).getTime()) {
      stats[wid].lastRun = String(r.created_at);
    }
  }
  for (const wid of Object.keys(stats)) {
    const total = ((runs || []) as Record<string, unknown>[]).filter((r) => String(r.workflow_id) === wid).length;
    stats[wid].success = total > 0 ? Math.round((stats[wid].success / total) * 1000) / 10 : 0;
  }

  return NextResponse.json({
    data: {
      runs: ((runs || []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        workflowId: String(r.workflow_id || ''),
        workflowName: names.get(String(r.workflow_id || '')) || '—',
        enrollmentId: r.enrollment_id ? String(r.enrollment_id) : null,
        actionType: String(r.action_type || ''),
        status: String(r.status || ''),
        result: resultOf(String(r.status || '')),
        scheduledFor: r.scheduled_for ? String(r.scheduled_for) : null,
        executedAt: r.executed_at ? String(r.executed_at) : null,
        errorMessage: r.error_message ? String(r.error_message) : null,
        createdAt: String(r.created_at || ''),
      })),
      stats,
    },
  });
}
