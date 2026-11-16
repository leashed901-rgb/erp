import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/workflow-instances — approval instances (Batch I).
 * POST — start an instance for a workflow + entity (status pending).
 * No engine auto-starts these today; the screen records the instance
 * and its actions by hand, and the action route below moves it.
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const workflowId = q.get('workflowId');
  const status = q.get('status');
  let query = supabaseAdmin().from('acct_workflow_instances').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('started_at', { ascending: false }).limit(200);
  if (workflowId) query = query.eq('workflow_id', workflowId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const workflowIds = [...new Set(((data ?? []) as { workflow_id: string }[]).map((i) => i.workflow_id))] as string[];
  const { data: workflows } = workflowIds.length
    ? await supabaseAdmin().from('acct_workflows').select('id, name').in('id', workflowIds)
    : { data: [] };
  const workflowById = new Map(((workflows ?? []) as Record<string, unknown>[]).map((w) => [w.id, w.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((i) => ({
      id: i.id,
      workflowId: i.workflow_id,
      workflow: (workflowById.get(i.workflow_id as string) as string) || '—',
      entityType: i.entity_type,
      entityId: i.entity_id,
      status: i.status,
      currentStep: i.current_step,
      startedAt: i.started_at,
      completedAt: i.completed_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const workflowId = String(body.workflowId || '');
  const entityType = String(body.entityType || '').trim();
  const entityId = String(body.entityId || '').trim();
  if (!workflowId) return err('VALIDATION', 'workflowId is required', 400);
  if (!entityType) return err('VALIDATION', 'entityType is required', 400);
  if (!entityId) return err('VALIDATION', 'entityId is required', 400);
  const sb = supabaseAdmin();
  const { data: workflow } = await sb.from('acct_workflows').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', workflowId).single();
  if (!workflow) return err('VALIDATION', 'Unknown workflow', 400);
  const { data, error } = await sb.from('acct_workflow_instances').insert({
    tenant_id: DEFAULT_TENANT_ID,
    workflow_id: workflowId,
    entity_type: entityType,
    entity_id: entityId,
    status: 'pending',
    current_step: Number(body.currentStep || 1),
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, workflowId: data.workflow_id, entityType: data.entity_type, entityId: data.entity_id, status: data.status, currentStep: data.current_step } }, { status: 201 });
}
