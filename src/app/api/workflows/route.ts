import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/workflows — approval workflows (Batch I). A workflow is a
 * rule set for an entity type (invoices, bills, journals...): above
 * a threshold amount, the rules decide who approves. POST — create
 * (name + entity type + rules jsonb).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_workflows').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  const ids = ((data ?? []) as { id: string }[]).map((w) => w.id);
  const instanceCounts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: instances } = await sb.from('acct_workflow_instances').select('workflow_id').in('workflow_id', ids.slice(i, i + 100));
      for (const inst of (instances ?? []) as { workflow_id: string }[]) instanceCounts.set(inst.workflow_id, (instanceCounts.get(inst.workflow_id) || 0) + 1);
    }
  }
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((w) => ({
      id: w.id,
      name: w.name,
      entityType: w.entity_type,
      thresholdAmount: w.threshold_amount == null ? null : Number(w.threshold_amount),
      rules: w.rules,
      isActive: w.is_active,
      instanceCount: instanceCounts.get(w.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const entityType = String(body.entityType || '').trim();
  const rules = (body.rules && typeof body.rules === 'object' ? body.rules : {}) as Record<string, unknown>;
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!entityType) return err('VALIDATION', 'entityType is required (e.g. invoice, bill, journal)', 400);
  const { data, error } = await supabaseAdmin().from('acct_workflows').insert({
    tenant_id: DEFAULT_TENANT_ID,
    name,
    entity_type: entityType,
    threshold_amount: body.thresholdAmount == null ? null : Number(body.thresholdAmount),
    rules,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, entityType: data.entity_type, thresholdAmount: data.threshold_amount == null ? null : Number(data.threshold_amount), isActive: data.is_active, instanceCount: 0 } }, { status: 201 });
}
