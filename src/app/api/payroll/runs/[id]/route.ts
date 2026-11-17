import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toRun, toItem } from '../route';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/payroll/runs/[id] — run detail with items + employee names. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: run, error } = await sb
    .from('acct_payroll_runs')
    .select('*, acct_pay_periods(period_start,period_end,pay_date)')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!run) return err('NOT_FOUND', 'Pay run not found', 404);
  const { data: items } = await sb.from('acct_payroll_run_items').select('*').eq('payroll_run_id', id);
  const empIds = [...new Set((items || []).map((i) => i.employee_id))];
  const names = new Map<string, string>();
  if (empIds.length) {
    const { data: emps } = await sb.from('acct_employees').select('id,first_name,last_name').in('id', empIds);
    (emps || []).forEach((e) => names.set(e.id, `${e.first_name} ${e.last_name}`));
  }
  return NextResponse.json({
    data: toRun(run, run.acct_pay_periods as Record<string, unknown> | null,
      (items || []).map((r) => toItem(r, names.get(r.employee_id) || ''))),
  });
}

/** PATCH /api/payroll/runs/[id] — lifecycle: approve a draft run. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const patch: Record<string, unknown> = {};
  if (body.status === 'approved') {
    patch.status = 'approved';
    patch.approved_at = new Date().toISOString();
  } else if (body.status === 'draft') {
    patch.status = 'draft';
    patch.approved_at = null;
  } else {
    return err('VALIDATION', 'status must be approved or draft', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_payroll_runs')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toRun(data) });
}
