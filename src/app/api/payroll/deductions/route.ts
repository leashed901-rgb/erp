import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { Deduction } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/payroll/deductions — employee deduction elections. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_payroll_deductions')
    .select('*, acct_employees(first_name,last_name)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: Deduction[] = (data || []).map((r) => {
    const e = (r.acct_employees || {}) as { first_name?: string; last_name?: string };
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeName: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      deductionCode: r.deduction_code,
      label: r.label,
      deductionType: r.deduction_type,
      isPretax: Boolean(r.is_pretax),
      calcMethod: r.calc_method,
      amount: r.amount != null ? Number(r.amount) : null,
      percent: r.percent != null ? Number(r.percent) : null,
      isActive: Boolean(r.is_active),
    };
  });
  return NextResponse.json({ data: dtos });
}

/** POST /api/payroll/deductions */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.employeeId || !body.deductionCode || !body.label) {
    return err('VALIDATION', 'employeeId, deductionCode and label are required', 400);
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    employee_id: String(body.employeeId),
    deduction_code: String(body.deductionCode),
    label: String(body.label),
    deduction_type: body.deductionType ? String(body.deductionType) : 'other',
    is_pretax: Boolean(body.isPretax),
    calc_method: ({ fixed: 'fixed_amount', percent: 'percent_of_gross' } as Record<string, string>)[String(body.calcMethod || '')] || String(body.calcMethod || (body.percent != null ? 'percent_of_gross' : 'fixed_amount')),
    amount: body.amount != null ? Number(body.amount) : 0, // column is NOT NULL; percent rows carry 0
    percent: body.percent != null ? Number(body.percent) : null,
    is_active: true,
  };
  const { data, error } = await supabaseAdmin().from('acct_payroll_deductions').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
