import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAutomationFlow } from '@/lib/marketingTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const STATUSES = ['draft', 'active', 'paused', 'archived'];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
    patch.status = body.status;
  }
  if (body.trigger !== undefined) patch.trigger_definition = obj(body.trigger);
  if (body.condition !== undefined) patch.condition_definition = obj(body.condition);
  if (body.action !== undefined) patch.action_definition = obj(body.action);
  if (typeof body.allowReentry === 'boolean') patch.allow_reentry = body.allowReentry;
  if (typeof body.workflowType === 'string') {
    patch.workflow_type = ['rebooking', 'appointment_reminder', 'vaccine_reminder', 'unsigned_document', 'birthday', 'win_back', 'payment_reminder', 'custom'].includes(body.workflowType) ? body.workflowType : 'custom';
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_automation_workflows')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Flow not found', 404);
  return NextResponse.json({ data: toAutomationFlow(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('crm_automation_workflows').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
