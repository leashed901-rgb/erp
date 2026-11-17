import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

function toFinding(r: Record<string, unknown>) {
  return {
    id: r.id, checkCode: r.check_code, severity: r.severity, title: r.title,
    detail: r.detail, sourceType: r.source_type, sourceId: r.source_id,
    journalEntryId: r.journal_entry_id, accountId: r.account_id,
    amount: r.amount, txnDate: r.txn_date, status: r.status,
    assigneeId: r.assignee_id, resolutionNote: r.resolution_note,
    firstRunId: r.first_run_id, lastRunId: r.last_run_id,
  };
}

/** GET /api/review-runs/[id] — run + its findings (latest run first). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = new URL(req.url).searchParams.get('status');
  const { data: run, error } = await supabaseAdmin()
    .from('acct_review_runs')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !run) return err('NOT_FOUND', 'Review run not found', 404);
  let query = supabaseAdmin()
    .from('acct_review_findings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('last_run_id', id)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data: findings } = await query;
  const r = run as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: r.id, periodFrom: r.period_from, periodTo: r.period_to,
      findingCount: r.finding_count, newCount: r.new_count,
      runAt: r.run_at, summary: r.summary,
      findings: ((findings ?? []) as Record<string, unknown>[]).map(toFinding),
    },
  });
}
