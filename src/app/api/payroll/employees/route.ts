import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { Employee } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toEmployee = (r: Record<string, unknown>): Employee => ({
  id: String(r.id),
  employeeNumber: (r.employee_number as string) || null,
  firstName: String(r.first_name || ''),
  lastName: String(r.last_name || ''),
  legalName: (r.legal_name as string) || null,
  email: (r.email as string) || null,
  phone: (r.phone as string) || null,
  hireDate: (r.hire_date as string) || null,
  employmentType: (r.employment_type as string) || null,
  payType: (r.pay_type as string) || null,
  payRate: r.pay_rate != null ? Number(r.pay_rate) : null,
  salaryAnnual: r.salary_annual != null ? Number(r.salary_annual) : null,
  standardHoursWeek: r.standard_hours_week != null ? Number(r.standard_hours_week) : null,
  taxFilingStatus: (r.tax_filing_status as string) || null,
  stateCode: (r.state_code as string) || null,
  paymentMethod: (r.payment_method as string) || null,
  status: String(r.status || 'active'),
  partyId: (r.party_id as string) || null,
});

/** GET /api/payroll/employees — registry surface: Payroll/Employees. */
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status');
  let q = supabaseAdmin()
    .from('acct_employees')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('last_name', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toEmployee) });
}

/** POST /api/payroll/employees — registry action create.employee. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.firstName || !body.lastName) return err('VALIDATION', 'firstName and lastName are required', 400);
  let employeeNumber = body.employeeNumber ? String(body.employeeNumber) : null;
  if (!employeeNumber) {
    const { count } = await supabaseAdmin()
      .from('acct_employees')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID);
    employeeNumber = `EMP-${String((count || 0) + 1).padStart(4, '0')}`;
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    employee_number: employeeNumber,
    first_name: String(body.firstName),
    last_name: String(body.lastName),
    legal_name: body.legalName ? String(body.legalName) : `${body.firstName} ${body.lastName}`,
    email: body.email ? String(body.email) : null,
    phone: body.phone ? String(body.phone) : null,
    hire_date: body.hireDate ? String(body.hireDate) : new Date().toISOString().slice(0, 10),
    employment_type: String(body.employmentType || 'w2_full_time'),
    pay_type: String(body.payType || 'hourly'),
    pay_rate: body.payRate != null ? Number(body.payRate) : null,
    salary_annual: body.salaryAnnual != null ? Number(body.salaryAnnual) : null,
    standard_hours_week: body.standardHoursWeek != null ? Number(body.standardHoursWeek) : 40,
    tax_filing_status: body.taxFilingStatus ? String(body.taxFilingStatus) : 'single',
    state_code: body.stateCode ? String(body.stateCode) : null,
    payment_method: String(body.paymentMethod || 'direct_deposit'),
    status: 'active',
    party_id: body.partyId ? String(body.partyId) : null,
  };
  const { data, error } = await supabaseAdmin().from('acct_employees').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toEmployee(data) }, { status: 201 });
}
