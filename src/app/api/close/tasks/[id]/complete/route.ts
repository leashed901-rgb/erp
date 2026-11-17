import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/close/tasks/[id]/complete — complete a close task (Batch G).
 * The engine re-runs the task's check: a failing check refuses the
 * completion unless overrideNote is given (recorded as a comment).
 * Tasks with requires_signoff land in ready_for_review, not done.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { data: task } = await supabaseAdmin()
    .from('acct_close_tasks')
    .select('id,close_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!task) return err('NOT_FOUND', 'Close task not found', 404);
  const { data, error } = await supabaseAdmin().rpc('acct_complete_close_task', {
    p_task_id: id,
    p_note: (body.note as string) || null,
    p_override_note: (body.overrideNote as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data });
}
