import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/workflow-instances/[id] — one instance + its action trail
 * (Batch I). POST — record an approver action (approve / reject) and
 * move the instance: approve advances the step; reject closes it as
 * rejected. A second action on a closed instance is a 400.
 * approverId is an AUTH user id — acct_workflow_actions.approver_id
 * has an FK to auth.users, not to acct_employees.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: instance, error }, { data: actions }] = await Promise.all([
    sb.from('acct_workflow_instances').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_workflow_actions').select('*').eq('workflow_instance_id', id).order('step_no'),
  ]);
  if (error || !instance) return err('NOT_FOUND', 'Workflow instance not found', 404);
  const approverIds = [...new Set(((actions ?? []) as { approver_id: string | null }[]).map((a) => a.approver_id).filter(Boolean))] as string[];
  const userById = new Map<string, string>();
  if (approverIds.length) {
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of (list?.users ?? [])) userById.set(u.id, (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email || u.id);
  }
  return NextResponse.json({
    data: {
      id: instance.id,
      workflowId: instance.workflow_id,
      entityType: instance.entity_type,
      entityId: instance.entity_id,
      status: instance.status,
      currentStep: instance.current_step,
      startedAt: instance.started_at,
      completedAt: instance.completed_at,
      actions: ((actions ?? []) as Record<string, unknown>[]).map((a) => ({
        id: a.id,
        stepNo: a.step_no,
        approverId: a.approver_id,
        approver: (userById.get(a.approver_id as string) as string) || '—',
        action: a.action,
        comments: a.comments,
        actedAt: a.acted_at,
      })),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  if (!['approve', 'reject'].includes(action)) return err('VALIDATION', 'action must be approve | reject', 400);
  const sb = supabaseAdmin();
  const { data: instance, error } = await sb.from('acct_workflow_instances').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !instance) return err('NOT_FOUND', 'Workflow instance not found', 404);
  if (instance.status !== 'pending') return err('VALIDATION', `Instance is already ${instance.status}`, 400);
  const approverId = body.approverId ? String(body.approverId) : null;
  if (approverId) {
    const { data: user, error: userErr } = await sb.auth.admin.getUserById(approverId);
    if (userErr || !user?.user) return err('VALIDATION', 'Unknown approver (must be a workspace user)', 400);
  }
  const { error: actionErr } = await sb.from('acct_workflow_actions').insert({
    workflow_instance_id: id,
    step_no: Number(instance.current_step || 1),
    approver_id: approverId,
    action,
    comments: body.comments ? String(body.comments) : null,
    acted_at: new Date().toISOString(),
  });
  if (actionErr) return err('INTERNAL', actionErr.message, 500);
  const patch: Record<string, unknown> = action === 'approve'
    ? { current_step: Number(instance.current_step || 1) + 1 }
    : { status: 'rejected', completed_at: new Date().toISOString() };
  const { data: updated } = await sb.from('acct_workflow_instances').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  return NextResponse.json({ data: { id: updated?.id || id, status: updated?.status || 'pending', currentStep: updated?.current_step } });
}
