import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toEmployee } from '../route';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const FIELDS: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', legalName: 'legal_name',
  email: 'email', phone: 'phone', hireDate: 'hire_date',
  employmentType: 'employment_type', payType: 'pay_type', payRate: 'pay_rate',
  salaryAnnual: 'salary_annual', standardHoursWeek: 'standard_hours_week',
  taxFilingStatus: 'tax_filing_status', stateCode: 'state_code',
  paymentMethod: 'payment_method', status: 'status',
};

/** PATCH /api/payroll/employees/[id] — Pay/Tax/Bank drawer sections save here. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const patch: Record<string, unknown> = {};
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (camel in body) patch[col] = body[camel];
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'No updatable fields supplied', 400);
  const { data, error } = await supabaseAdmin()
    .from('acct_employees')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toEmployee(data) });
}
