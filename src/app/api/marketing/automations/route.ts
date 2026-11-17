import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAutomationFlow } from '@/lib/marketingTypes';

/* Automation flows (doc 24) over crm_automation_workflows —
   trigger / condition / action definitions persist as jsonb. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_automation_workflows')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAutomationFlow(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_automation_workflows')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name: String(body.name),
      workflow_type: ['rebooking', 'appointment_reminder', 'vaccine_reminder', 'unsigned_document', 'birthday', 'win_back', 'payment_reminder', 'custom'].includes(String(body.workflowType)) ? String(body.workflowType) : 'custom',
      status: typeof body.status === 'string' ? body.status : 'draft',
      trigger_definition: obj(body.trigger),
      condition_definition: obj(body.condition),
      action_definition: obj(body.action),
      allow_reentry: body.allowReentry === true,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAutomationFlow(data as Record<string, unknown>) }, { status: 201 });
}
