import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

function toDto(r: Record<string, unknown>) {
  return {
    id: r.id, periodId: r.period_id, taskCode: r.task_code, taskName: r.task_name,
    sequenceNo: r.sequence_no, required: r.required, status: r.status,
    assignedTo: r.assigned_to, completedAt: r.completed_at, notes: r.notes,
  };
}

/**
 * GET /api/close/checklists — manual close checklist rows (Batch G).
 * These are the per-period checklist, separate from the template-driven
 * close tasks: a period's own list of must-dos. Filter by periodId.
 */
export async function GET(req: NextRequest) {
  const periodId = new URL(req.url).searchParams.get('periodId');
  let query = supabaseAdmin()
    .from('acct_close_checklists')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sequence_no', { ascending: true });
  if (periodId) query = query.eq('period_id', periodId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: ((data ?? []) as Record<string, unknown>[]).map(toDto) });
}

/** POST /api/close/checklists — add a checklist row for a period. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const periodId = String(body.periodId || '');
  const taskName = String(body.taskName || '').trim();
  if (!periodId || !taskName) return err('VALIDATION', 'periodId and taskName are required', 400);
  const { data: period } = await supabaseAdmin()
    .from('acct_periods')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', periodId)
    .maybeSingle();
  if (!period) return err('NOT_FOUND', 'Period not found', 404);
  const { data: maxRow } = await supabaseAdmin()
    .from('acct_close_checklists')
    .select('sequence_no')
    .eq('period_id', periodId)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabaseAdmin()
    .from('acct_close_checklists')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      period_id: periodId,
      task_code: String(body.taskCode || `CHK-${Date.now()}`).trim(),
      task_name: taskName,
      sequence_no: body.sequenceNo != null ? Number(body.sequenceNo) : ((maxRow as { sequence_no?: number } | null)?.sequence_no ?? 0) + 10,
      required: body.required !== false,
      status: 'open',
      assigned_to: (body.assignedTo as string) || null,
      notes: (body.notes as string) || null,
    })
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: toDto(data as Record<string, unknown>) }, { status: 201 });
}
