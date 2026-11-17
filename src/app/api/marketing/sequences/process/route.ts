import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { drainOutbox } from '@/lib/resend';

/* Sequence step processor (doc 24): enrollments sat 'active' with
   next_run_at in the past and nothing ever advanced them — there was no
   processor. POST advances every due enrollment by one step:
   - email step → enqueue via email_enqueue (verified sender domain) and
     drain inline so it actually sends
   - task step → insert an open crm_tasks row
   Then current_step+1, next_run_at = now + next step's delay, or
   status 'completed' when no steps remain. GET reports how many are due. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

type Step = {
  id: string;
  step_no: number;
  delay_days: number;
  step_type: string;
  template_id: string | null;
  subject: string | null;
  body: string | null;
  task_title: string | null;
};

type Enrollment = {
  id: string;
  sequence_id: string;
  customer_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  email: string | null;
  current_step: number;
  next_run_at: string | null;
};

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_sequence_enrollments')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'active')
    .lte('next_run_at', new Date().toISOString());
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { due: (data || []).length } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 100;
  const sb = supabaseAdmin();

  const { data: due, error: dueErr } = await sb
    .from('crm_sequence_enrollments')
    .select('id, sequence_id, customer_id, lead_id, deal_id, email, current_step, next_run_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'active')
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(limit);
  if (dueErr) return err('INTERNAL', dueErr.message, 500);
  const enrollments = (due || []) as Enrollment[];
  if (!enrollments.length) return NextResponse.json({ data: { processed: [], enqueued: 0, delivered: 0, failed: 0, drainErrors: [] } });

  const { data: senderRow } = await sb
    .from('email_sender_domains')
    .select('domain, default_from')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'verified')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sender = senderRow as { domain: string; default_from: string | null } | null;
  const from = sender ? sender.default_from || `no-reply@${sender.domain}` : null;

  const processed: Record<string, unknown>[] = [];
  let enqueued = 0;
  for (const enr of enrollments) {
    const { data: stepsData } = await sb
      .from('crm_sequence_steps')
      .select('id, step_no, delay_days, step_type, template_id, subject, body, task_title')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('sequence_id', enr.sequence_id)
      .order('step_no', { ascending: true });
    const steps = (stepsData || []) as Step[];
    const idx = enr.current_step || 0;
    if (idx >= steps.length) {
      await sb.from('crm_sequence_enrollments').update({ status: 'completed', next_run_at: null }).eq('id', enr.id);
      processed.push({ enrollmentId: enr.id, outcome: 'completed', detail: 'no further steps' });
      continue;
    }
    const step = steps[idx];
    try {
      if (step.step_type === 'email') {
        if (!enr.email) throw new Error('enrollment has no email address');
        if (!from) throw new Error('no verified sending domain for this tenant');
        let subject = step.subject || '';
        let html: string | null = step.body;
        let text: string | null = step.body;
        if (step.template_id) {
          const { data: tpl } = await sb
            .from('crm_message_templates')
            .select('subject, body')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('id', step.template_id)
            .maybeSingle();
          const t = tpl as { subject?: string; body?: string } | null;
          if (t) {
            subject = subject || t.subject || '';
            html = html || t.body || null;
            text = text || t.body || null;
          }
        }
        if (!subject) subject = 'Follow-up';
        if (!html && !text) text = subject;
        const { error: enqErr } = await sb.rpc('email_enqueue', {
          p_tenant_id: DEFAULT_TENANT_ID,
          p_idempotency_key: `sequence:${enr.id}:step:${step.step_no}`,
          p_from: from,
          p_to: [enr.email],
          p_subject: subject,
          p_html: html,
          p_text: text,
          p_category: 'marketing',
          p_related_type: 'crm_sequence_enrollments',
          p_related_id: enr.id,
        });
        if (enqErr) throw new Error(`enqueue failed: ${enqErr.message}`);
        enqueued++;
        processed.push({ enrollmentId: enr.id, outcome: 'email_sent', detail: `step ${step.step_no}: ${subject}` });
      } else if (step.step_type === 'task') {
        const { error: taskErr } = await sb.from('crm_tasks').insert({
          tenant_id: DEFAULT_TENANT_ID,
          customer_id: enr.customer_id,
          lead_id: enr.lead_id,
          title: step.task_title || step.subject || 'Sequence follow-up',
          description: `Sequence step ${step.step_no} for ${enr.email || 'enrollment ' + enr.id}`,
          status: 'open',
          due_at: new Date().toISOString(),
          related_type: 'crm_sequence_enrollments',
          related_id: enr.id,
        });
        if (taskErr) throw new Error(`task insert failed: ${taskErr.message}`);
        processed.push({ enrollmentId: enr.id, outcome: 'task_created', detail: step.task_title || 'follow-up task' });
      } else {
        processed.push({ enrollmentId: enr.id, outcome: 'skipped', detail: `unknown step_type ${step.step_type}` });
      }
    } catch (e) {
      processed.push({ enrollmentId: enr.id, outcome: 'error', detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const nextIdx = idx + 1;
    if (nextIdx >= steps.length) {
      await sb.from('crm_sequence_enrollments').update({ status: 'completed', next_run_at: null }).eq('id', enr.id);
    } else {
      const delay = steps[nextIdx].delay_days || 0;
      const nextRun = new Date(Date.now() + delay * 24 * 60 * 60 * 1000).toISOString();
      await sb
        .from('crm_sequence_enrollments')
        .update({ current_step: nextIdx, next_run_at: nextRun })
        .eq('id', enr.id);
    }
  }

  let delivered = 0;
  let failed = 0;
  let drainErrors: string[] = [];
  if (enqueued > 0) {
    try {
      const drained = await drainOutbox(Math.max(enqueued, 50));
      delivered = drained.sent;
      failed = drained.failed;
      drainErrors = drained.errors;
    } catch (e) {
      failed = enqueued;
      drainErrors = [e instanceof Error ? e.message : String(e)];
    }
  }
  return NextResponse.json({ data: { processed, enqueued, delivered, failed, drainErrors } });
}
