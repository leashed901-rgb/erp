import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toEscalationPolicy } from '@/lib/supportTypes';

/* Escalation policies (doc 26) over support_escalation_policies +
   support_escalation_policy_steps. A policy with no steps exhausts
   every page instantly (support__page_step), so steps are part of
   the policy: each targets a staff member, a team, or a schedule. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface PolicyStep {
  stepNo: number;
  targetType: string;
  staffId: string | null;
  teamId: string | null;
  scheduleId: string | null;
  ackTimeoutMinutes: number;
  channels: string[];
}

function stepDto(r: Record<string, unknown>): PolicyStep {
  return {
    stepNo: Number(r.step_no || 0),
    targetType: String(r.target_type || ''),
    staffId: typeof r.staff_id === 'string' ? r.staff_id : null,
    teamId: typeof r.team_id === 'string' ? r.team_id : null,
    scheduleId: typeof r.schedule_id === 'string' ? r.schedule_id : null,
    ackTimeoutMinutes: Number(r.ack_timeout_minutes || 0),
    channels: Array.isArray(r.channels) ? r.channels.map(String) : [],
  };
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_escalation_policies')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const policies = (data || []).map((r) => toEscalationPolicy(r as Record<string, unknown>));
  if (policies.length) {
    const { data: steps } = await sb
      .from('support_escalation_policy_steps')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('policy_id', policies.map((p) => p.id))
      .order('step_no', { ascending: true });
    const byPolicy = new Map<string, PolicyStep[]>();
    for (const s of steps || []) {
      const row = s as Record<string, unknown>;
      const key = String(row.policy_id);
      byPolicy.set(key, [...(byPolicy.get(key) || []), stepDto(row)]);
    }
    return NextResponse.json({ data: policies.map((p) => ({ ...p, steps: byPolicy.get(p.id) || [] })) });
  }
  return NextResponse.json({ data: policies });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_escalation_policies')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      repeat_count: typeof body.repeatCount === 'number' ? body.repeatCount : 3,
      trigger_on: Array.isArray(body.triggerOn) ? body.triggerOn : typeof body.triggerOn === 'string' ? [body.triggerOn] : ['no_ack'],
      match_priorities: Array.isArray(body.matchPriorities) ? body.matchPriorities : [],
      is_default: Boolean(body.isDefault),
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const policy = toEscalationPolicy(data as Record<string, unknown>);

  const stepsIn = Array.isArray(body.steps) ? (body.steps as Array<Record<string, unknown>>) : [];
  const inserted: PolicyStep[] = [];
  for (let i = 0; i < stepsIn.length; i++) {
    const s = stepsIn[i];
    const targetType = typeof s.targetType === 'string' ? s.targetType : 'staff';
    const { data: stepRow, error: stepErr } = await sb
      .from('support_escalation_policy_steps')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        policy_id: policy.id,
        step_no: typeof s.stepNo === 'number' ? s.stepNo : i + 1,
        ack_timeout_minutes: typeof s.ackTimeoutMinutes === 'number' ? s.ackTimeoutMinutes : 15,
        target_type: targetType,
        staff_id: targetType === 'staff' && typeof s.staffId === 'string' ? s.staffId : null,
        team_id: targetType === 'team' && typeof s.teamId === 'string' ? s.teamId : null,
        schedule_id: targetType === 'schedule' && typeof s.scheduleId === 'string' ? s.scheduleId : null,
        channels: Array.isArray(s.channels) ? s.channels : ['in_app'],
      })
      .select('*')
      .single();
    if (stepErr) return err('INTERNAL', stepErr.message, 500);
    inserted.push(stepDto(stepRow as Record<string, unknown>));
  }
  return NextResponse.json({ data: { ...policy, steps: inserted } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
  if (typeof body.repeatCount === 'number') patch.repeat_count = body.repeatCount;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_escalation_policies')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Policy not found', 404);
  return NextResponse.json({ data: toEscalationPolicy(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('support_escalation_policies').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
