import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/close/tasks/[id]/signoff — sign off a task waiting for
 * review (Batch G). approve=false sends it back to in_progress with
 * the note as a comment. The engine refuses when the task is not in
 * ready_for_review.
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
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!task) return err('NOT_FOUND', 'Close task not found', 404);
  const { data, error } = await supabaseAdmin().rpc('acct_signoff_close_task', {
    p_task_id: id,
    p_approve: body.approve !== false,
    p_note: (body.note as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: { status: data } });
}
