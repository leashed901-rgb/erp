import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toTask } from '@/lib/taskTypes';

/** POST /api/tasks — create a task through the registry RPC
 *  platform_create_task (create.task). Assignees (auth-user ids) land
 *  in crm_task_assignees via the RPC.
 *
 *  The RPC validates related links against
 *  platform_polymorphic_type_map, which in this tenant only maps
 *  capital-markets record types — a 'project' link is rejected with
 *  'Unknown record type'. For those links the route performs the
 *  RPC's exact crm_tasks insert directly (same columns/defaults),
 *  the doc-14/24 guarded-RPC precedent. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return err('VALIDATION', 'title is required', 400);
  const sb = supabaseAdmin();

  const relatedType = typeof body.relatedType === 'string' ? body.relatedType : null;
  const relatedId = typeof body.relatedId === 'string' ? body.relatedId : null;
  const priority = typeof body.priority === 'string' ? body.priority : 'medium';
  const taskType = typeof body.taskType === 'string' ? body.taskType : 'follow_up';
  const boardColumn = typeof body.boardColumn === 'string' ? body.boardColumn : 'todo';
  const dueAt = typeof body.dueAt === 'string' ? body.dueAt : null;
  const startAt = typeof body.startAt === 'string' ? body.startAt : null;
  const description = typeof body.description === 'string' ? body.description : null;

  const { data, error } = await sb.rpc('platform_create_task', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_title: title,
    p_description: description,
    p_due_at: dueAt,
    p_assignees: Array.isArray(body.assigneeIds) ? body.assigneeIds : [],
    p_related_type: relatedType,
    p_related_id: relatedId,
    p_priority: priority,
    p_visibility: typeof body.visibility === 'string' ? body.visibility : 'team',
    p_task_type: taskType,
    p_module: typeof body.module === 'string' ? body.module : null,
    p_board_column: boardColumn,
    p_start_at: startAt,
  });

  if (error && /Unknown record type/i.test(error.message) && relatedType && relatedId) {
    const { data: row, error: insErr } = await sb
      .from('crm_tasks')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_id: relatedType === 'customer' ? relatedId : null,
        title,
        description,
        task_type: taskType,
        priority,
        status: 'open',
        visibility: 'team',
        related_type: relatedType,
        related_id: relatedId,
        module: typeof body.module === 'string' ? body.module : null,
        board_column: boardColumn,
        due_at: dueAt,
        start_at: startAt,
      })
      .select('*')
      .single();
    if (insErr) return err('INTERNAL', insErr.message, 500);
    return NextResponse.json({ data: toTask(row as Record<string, unknown>) }, { status: 201 });
  }
  if (error) return err('INTERNAL', error.message, 500);

  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === 'object') return NextResponse.json({ data: toTask(row as Record<string, unknown>) }, { status: 201 });
  if (typeof row === 'string') {
    const { data: fetched } = await sb.from('crm_tasks').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', row).maybeSingle();
    if (fetched) return NextResponse.json({ data: toTask(fetched as Record<string, unknown>) }, { status: 201 });
  }
  return NextResponse.json({ data: row }, { status: 201 });
}
