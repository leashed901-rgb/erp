import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { PayRun, PayRunItem } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toItem = (r: Record<string, unknown>, name = ''): PayRunItem => ({
  id: String(r.id),
  runId: String(r.payroll_run_id),
  employeeId: String(r.employee_id),
  employeeName: name,
  regularHours: Number(r.regular_hours) || 0,
  overtimeHours: Number(r.overtime_hours) || 0,
  regularPay: Number(r.regular_pay) || 0,
  overtimePay: Number(r.overtime_pay) || 0,
  bonusPay: Number(r.bonus_pay) || 0,
  grossPay: Number(r.gross_pay) || 0,
  federalIncomeTax: Number(r.federal_income_tax) || 0,
  stateIncomeTax: Number(r.state_income_tax) || 0,
  socialSecurityEe: Number(r.social_security_ee) || 0,
  medicareEe: Number(r.medicare_ee) || 0,
  pretaxDeductions: Number(r.pretax_deductions) || 0,
  posttaxDeductions: Number(r.posttax_deductions) || 0,
  netPay: Number(r.net_pay) || 0,
  paymentStatus: (r.payment_status as string) || null,
});

export const toRun = (r: Record<string, unknown>, period?: Record<string, unknown> | null, items: PayRunItem[] = []): PayRun => ({
  id: String(r.id),
  runNumber: (r.run_number as string) || null,
  payPeriodId: (r.pay_period_id as string) || null,
  periodStart: (period?.period_start as string) || null,
  periodEnd: (period?.period_end as string) || null,
  payDate: (period?.pay_date as string) || null,
  status: String(r.status || 'draft'),
  grossTotal: Number(r.gross_total) || 0,
  netTotal: Number(r.net_total) || 0,
  employeeTaxTotal: Number(r.employee_tax_total) || 0,
  employerTaxTotal: Number(r.employer_tax_total) || 0,
  deductionTotal: Number(r.deduction_total) || 0,
  employeeCount: Number(r.employee_count) || 0,
  glJournalEntryId: (r.gl_journal_entry_id as string) || null,
  approvedAt: (r.approved_at as string) || null,
  processedAt: (r.processed_at as string) || null,
  items,
});

/** GET /api/payroll/runs — pay runs with their periods (doc 12). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_payroll_runs')
    .select('*, acct_pay_periods(period_start,period_end,pay_date)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: (data || []).map((r) => toRun(r, r.acct_pay_periods as Record<string, unknown> | null)),
  });
}

interface ItemInput {
  employeeId: string;
  regularHours: number; overtimeHours: number;
  regularPay: number; overtimePay: number; bonusPay: number; grossPay: number;
  federalIncomeTax: number; stateIncomeTax: number;
  socialSecurityEe: number; medicareEe: number;
  socialSecurityEr: number; medicareEr: number; futaEr: number; sutaEr: number;
  pretaxDeductions: number; posttaxDeductions: number; netPay: number;
}

/** POST /api/payroll/runs — registry action create.payroll_run.
 *  Body: { payPeriodId, items: ItemInput[] } — creates the draft run and
 *  its items; run totals are re-summed server-side from the items. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const items = (body.items || []) as ItemInput[];
  if (!body.payPeriodId) return err('VALIDATION', 'payPeriodId is required', 400);
  if (!items.length) return err('VALIDATION', 'At least one run item is required', 400);
  const sb = supabaseAdmin();

  const { data: period } = await sb.from('acct_pay_periods').select('*').eq('id', String(body.payPeriodId)).eq('tenant_id', DEFAULT_TENANT_ID).single();
  if (!period) return err('NOT_FOUND', 'Pay period not found', 404);

  const sum = (f: (i: ItemInput) => number) => Math.round(items.reduce((s, i) => s + (Number(f(i)) || 0), 0) * 100) / 100;
  // Run numbers are unique per tenant. The default PR-<period_start>
  // collides with an earlier run for the same period, so suffix it.
  let runNumber = String(body.runNumber || `PR-${period.period_start}`);
  if (!body.runNumber) {
    const { data: taken } = await sb.from('acct_payroll_runs').select('run_number').eq('tenant_id', DEFAULT_TENANT_ID).like('run_number', `${runNumber}%`);
    const used = new Set((taken || []).map((r) => r.run_number));
    if (used.has(runNumber)) {
      let n = 2;
      while (used.has(`${runNumber}-${n}`) && n < 100) n++;
      runNumber = `${runNumber}-${n}`;
    }
  }
  // Net pay follows the identity acct_post_payroll_run enforces at post
  // time (gross − employee taxes − deductions = net). Callers that omit
  // netPay used to store net 0, creating runs that could never post;
  // derive it here, and reject an explicitly inconsistent netPay.
  const eeTax = (i: ItemInput) => (Number(i.federalIncomeTax) || 0) + (Number(i.stateIncomeTax) || 0) + (Number(i.socialSecurityEe) || 0) + (Number(i.medicareEe) || 0);
  const ded = (i: ItemInput) => (Number(i.pretaxDeductions) || 0) + (Number(i.posttaxDeductions) || 0);
  for (const i of items) {
    const derived = Math.round(((Number(i.grossPay) || 0) - eeTax(i) - ded(i)) * 100) / 100;
    if (i.netPay === undefined || i.netPay === null) i.netPay = derived;
    else if (Math.abs(Number(i.netPay) - derived) > 0.01) {
      return err('VALIDATION', `Payroll does not add up for an item: gross ${Number(i.grossPay) || 0} - taxes ${eeTax(i)} - deductions ${ded(i)} <> net pay ${i.netPay}`, 400);
    }
  }
  const runInsert = {
    tenant_id: DEFAULT_TENANT_ID,
    pay_period_id: period.id,
    run_number: runNumber,
    run_type: 'regular',
    status: 'draft',
    gross_total: sum((i) => i.grossPay),
    net_total: sum((i) => i.netPay),
    employee_tax_total: sum((i) => i.federalIncomeTax + i.stateIncomeTax + i.socialSecurityEe + i.medicareEe),
    employer_tax_total: sum((i) => i.socialSecurityEr + i.medicareEr + i.futaEr + i.sutaEr),
    deduction_total: sum((i) => i.pretaxDeductions + i.posttaxDeductions),
    employee_count: items.length,
    provider: 'internal',
  };
  const { data: run, error: runErr } = await sb.from('acct_payroll_runs').insert(runInsert).select('*').single();
  if (runErr) return err('INTERNAL', runErr.message, 500);

  const itemRows = items.map((i) => ({
    payroll_run_id: run.id,
    employee_id: i.employeeId,
    regular_hours: i.regularHours || 0,
    overtime_hours: i.overtimeHours || 0,
    regular_pay: i.regularPay || 0,
    overtime_pay: i.overtimePay || 0,
    bonus_pay: i.bonusPay || 0,
    gross_pay: i.grossPay || 0,
    federal_income_tax: i.federalIncomeTax || 0,
    state_income_tax: i.stateIncomeTax || 0,
    social_security_ee: i.socialSecurityEe || 0,
    medicare_ee: i.medicareEe || 0,
    social_security_er: i.socialSecurityEr || 0,
    medicare_er: i.medicareEr || 0,
    futa_er: i.futaEr || 0,
    suta_er: i.sutaEr || 0,
    pretax_deductions: i.pretaxDeductions || 0,
    posttax_deductions: i.posttaxDeductions || 0,
    net_pay: i.netPay || 0,
    payment_status: 'pending',
  }));
  const { data: savedItems, error: itemErr } = await sb.from('acct_payroll_run_items').insert(itemRows).select('*');
  if (itemErr) {
    await sb.from('acct_payroll_runs').delete().eq('id', run.id);
    return err('INTERNAL', itemErr.message, 500);
  }
  return NextResponse.json({ data: toRun(run, period, (savedItems || []).map((r) => toItem(r))) }, { status: 201 });
}
