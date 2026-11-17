import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function counts(closeId: string) {
  const { count: total } = await supabaseAdmin()
    .from('acct_close_tasks').select('id', { count: 'exact', head: true }).eq('close_id', closeId);
  const { count: done } = await supabaseAdmin()
    .from('acct_close_tasks').select('id', { count: 'exact', head: true }).eq('close_id', closeId).in('status', ['done', 'skipped']);
  const { count: overdue } = await supabaseAdmin()
    .from('acct_close_tasks').select('id', { count: 'exact', head: true }).eq('close_id', closeId).not('status', 'in', '("done","skipped")').lt('due_date', new Date().toISOString().slice(0, 10));
  return { total: total ?? 0, done: done ?? 0, overdue: overdue ?? 0 };
}

/** GET /api/close/closes — month-end closes with task rollups. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_closes')
    .select('*,acct_periods(name,status)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_end', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const out = [];
  for (const r of rows) {
    const c = await counts(r.id as string);
    const p = r.acct_periods as { name?: string; status?: string } | null;
    out.push({
      id: r.id,
      periodId: r.period_id,
      periodName: p?.name ?? null,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      tasksTotal: c.total,
      tasksDone: c.done,
      tasksOverdue: c.overdue,
      openErrorFindings: 0,
      periodStatus: p?.status ?? null,
      startedAt: r.started_at,
      finalizedAt: r.finalized_at,
    });
  }
  return NextResponse.json({ data: out });
}

/**
 * POST /api/close/closes — start a close for the period containing
 * periodEnd (Batch G). The engine creates the default "Month-end close"
 * template on first use and instantiates its tasks; calling it twice
 * for the same period returns the existing close (idempotent).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const periodEnd = String(body.periodEnd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return err('VALIDATION', 'periodEnd (YYYY-MM-DD) is required', 400);
  }
  const { data: closeId, error } = await supabaseAdmin().rpc('acct_generate_close', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_period_end: periodEnd,
    p_template_id: (body.templateId as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data } = await supabaseAdmin()
    .from('acct_closes')
    .select('*,acct_periods(name,status)')
    .eq('id', closeId as string)
    .single();
  const c = await counts(closeId as string);
  const r = data as Record<string, unknown>;
  const p = r.acct_periods as { name?: string; status?: string } | null;
  return NextResponse.json({
    data: {
      id: r.id,
      periodId: r.period_id,
      periodName: p?.name ?? null,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      tasksTotal: c.total,
      tasksDone: c.done,
      tasksOverdue: c.overdue,
      openErrorFindings: 0,
      periodStatus: p?.status ?? null,
      startedAt: r.started_at,
      finalizedAt: r.finalized_at,
    },
  }, { status: 201 });
}
