import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/close/closes/[id] — close detail via the engine's status
 * function (Batch G). acct_close_status re-runs every task's check
 * live and returns the task list with check results, so the detail
 * always reflects the books as they stand now — not a stale snapshot.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: close, error: closeErr } = await supabaseAdmin()
    .from('acct_closes')
    .select('*,acct_periods(name,status)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (closeErr || !close) return err('NOT_FOUND', 'Close not found', 404);
  const { data: status, error } = await supabaseAdmin().rpc('acct_close_status', {
    p_close_id: id,
    p_run_checks: true,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const s = status as Record<string, unknown>;
  const taskIds = ((s.tasks as Record<string, unknown>[]) ?? []).map((t) => t.id as string);
  let commentsByTask = new Map<string, { id: string; body: string; createdAt: string }[]>();
  if (taskIds.length > 0) {
    const { data: comments } = await supabaseAdmin()
      .from('acct_close_task_comments')
      .select('id,task_id,body,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('task_id', taskIds)
      .order('created_at', { ascending: true });
    for (const c of (comments ?? []) as Record<string, unknown>[]) {
      const list = commentsByTask.get(c.task_id as string) ?? [];
      list.push({ id: c.id as string, body: c.body as string, createdAt: c.created_at as string });
      commentsByTask.set(c.task_id as string, list);
    }
  }
  const p = (close as Record<string, unknown>).acct_periods as { name?: string; status?: string } | null;
  const r = close as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: r.id,
      periodId: r.period_id,
      periodName: p?.name ?? null,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      status: s.status,
      tasksTotal: s.tasks_total,
      tasksDone: s.tasks_done,
      tasksOverdue: s.tasks_overdue,
      openErrorFindings: s.open_error_findings,
      periodStatus: s.period_status,
      startedAt: r.started_at,
      finalizedAt: r.finalized_at,
      notes: r.notes,
      tasks: ((s.tasks as Record<string, unknown>[]) ?? []).map((t) => ({
        id: t.id,
        section: t.section,
        title: t.title,
        status: t.status,
        due: t.due,
        overdue: t.overdue,
        priority: t.priority,
        assignee: t.assignee,
        reviewer: t.reviewer,
        check: t.check,
        parent: t.parent,
        tags: t.tags ?? [],
        comments: commentsByTask.get(t.id as string) ?? [],
      })),
    },
  });
}
