import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { PayPeriod } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const toDto = (r: Record<string, unknown>): PayPeriod => ({
  id: String(r.id),
  periodStart: String(r.period_start),
  periodEnd: String(r.period_end),
  payDate: String(r.pay_date),
  frequency: (r.frequency as string) || null,
  status: String(r.status || 'open'),
});

/** GET /api/payroll/periods */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_pay_periods')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_start', { ascending: false })
    .limit(50);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toDto) });
}

/** POST /api/payroll/periods */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.periodStart || !body.periodEnd || !body.payDate) {
    return err('VALIDATION', 'periodStart, periodEnd and payDate are required', 400);
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    period_start: String(body.periodStart),
    period_end: String(body.periodEnd),
    pay_date: String(body.payDate),
    frequency: String(body.frequency || 'biweekly'),
    status: 'open',
  };
  const { data, error } = await supabaseAdmin().from('acct_pay_periods').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toDto(data) }, { status: 201 });
}
