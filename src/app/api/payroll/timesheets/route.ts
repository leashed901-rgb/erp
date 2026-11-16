import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { Timesheet } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toTimesheet = (r: Record<string, unknown>, name = ''): Timesheet => ({
  id: String(r.id),
  employeeId: (r.employee_id as string) || null,
  employeeName: name,
  workDate: (r.work_date as string) || null,
  hours: r.hours != null ? Number(r.hours) : null,
  rate: r.rate != null ? Number(r.rate) : null,
  description: (r.description as string) || null,
  status: String(r.status || 'draft'),
  approvedAt: null,
});

/**
 * GET /api/payroll/timesheets — payroll time entries (acct_time_entries
 * with billable=false). The billable project-time rows (the "Proof entry"
 * design work) live in the same table but are NOT payroll time.
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const sb = supabaseAdmin();
  let q = sb
    .from('acct_time_entries')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('billable', false)
    .not('employee_id', 'is', null)
    .order('work_date', { ascending: false })
    .limit(200);
  if (sp.get('employeeId')) q = q.eq('employee_id', sp.get('employeeId')!);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data, error } = await q;
  if (error) return err('INTERNAL', error.message, 500);
  const empIds = [...new Set((data || []).map((r) => r.employee_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (empIds.length) {
    const { data: emps } = await sb.from('acct_employees').select('id,first_name,last_name').in('id', empIds);
    (emps || []).forEach((e) => names.set(e.id, `${e.first_name} ${e.last_name}`));
  }
  return NextResponse.json({ data: (data || []).map((r) => toTimesheet(r, names.get(r.employee_id) || '')) });
}

/** POST /api/payroll/timesheets — log payroll time. Body: { employeeId, workDate, hours, rate?, description? }. Stored as a billable=false acct_time_entries row, status 'open' (the table's status CHECK allows open|approved|invoiced|void only — no 'draft'). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.employeeId) return err('VALIDATION', 'employeeId is required', 400);
  if (!body.workDate) return err('VALIDATION', 'workDate is required', 400);
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) return err('VALIDATION', 'hours must be a number greater than 0', 400);
  const sb = supabaseAdmin();
  const { data: emp, error: empErr } = await sb
    .from('acct_employees')
    .select('id,pay_rate')
    .eq('id', String(body.employeeId))
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (empErr || !emp) return err('VALIDATION', 'employeeId not found for this tenant', 400);
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    employee_id: String(body.employeeId),
    work_date: String(body.workDate),
    hours,
    rate: body.rate != null && body.rate !== '' ? Number(body.rate) : (emp.pay_rate != null ? Number(emp.pay_rate) : null),
    billable: false,
    description: body.description ? String(body.description) : null,
    status: 'open',
  };
  const { data, error } = await sb.from('acct_time_entries').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toTimesheet(data, '') }, { status: 201 });
}
