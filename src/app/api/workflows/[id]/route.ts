import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/workflows/[id] — one workflow + its instances (Batch I).
 * PATCH — name / threshold / rules / active. DELETE — removes the
 * actions + instances first, then the workflow.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: workflow, error }, { data: instances }] = await Promise.all([
    sb.from('acct_workflows').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_workflow_instances').select('*').eq('workflow_id', id).order('started_at', { ascending: false }),
  ]);
  if (error || !workflow) return err('NOT_FOUND', 'Workflow not found', 404);
  return NextResponse.json({
    data: {
      id: workflow.id,
      name: workflow.name,
      entityType: workflow.entity_type,
      thresholdAmount: workflow.threshold_amount == null ? null : Number(workflow.threshold_amount),
      rules: workflow.rules,
      isActive: workflow.is_active,
      instances: ((instances ?? []) as Record<string, unknown>[]).map((i) => ({
        id: i.id,
        entityType: i.entity_type,
        entityId: i.entity_id,
        status: i.status,
        currentStep: i.current_step,
        startedAt: i.started_at,
        completedAt: i.completed_at,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.thresholdAmount !== undefined) patch.threshold_amount = body.thresholdAmount == null ? null : Number(body.thresholdAmount);
  if (body.rules !== undefined) patch.rules = (body.rules && typeof body.rules === 'object' ? body.rules : {});
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_workflows').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Workflow not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, thresholdAmount: data.threshold_amount == null ? null : Number(data.threshold_amount), isActive: data.is_active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: workflow } = await sb.from('acct_workflows').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!workflow) return err('NOT_FOUND', 'Workflow not found', 404);
  const { data: instances } = await sb.from('acct_workflow_instances').select('id').eq('workflow_id', id);
  const instanceIds = ((instances ?? []) as { id: string }[]).map((i) => i.id);
  if (instanceIds.length) {
    for (let i = 0; i < instanceIds.length; i += 100) {
      await sb.from('acct_workflow_actions').delete().in('instance_id', instanceIds.slice(i, i + 100));
    }
  }
  await sb.from('acct_workflow_instances').delete().eq('workflow_id', id);
  const { error } = await sb.from('acct_workflows').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
