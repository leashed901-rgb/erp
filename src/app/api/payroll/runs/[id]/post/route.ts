import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/payroll/runs/[id]/post — registry action payroll.post →
 * acct_post_payroll_run. Posts the GL journal (wages expense, tax
 * liabilities, bank) and marks the run processed.
 * Body: { bankAccountId?, payDate? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }
  const sb = supabaseAdmin();
  const { data: run } = await sb.from('acct_payroll_runs').select('id,status').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!run) return err('NOT_FOUND', 'Pay run not found', 404);
  const { data, error } = await sb.rpc('acct_post_payroll_run', {
    p_run_id: id,
    p_pay_from_bank_account_id: body.bankAccountId ? String(body.bankAccountId) : null,
    p_pay_date: body.payDate ? String(body.payDate) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: after } = await sb.from('acct_payroll_runs').select('*').eq('id', id).single();
  return NextResponse.json({ data: { rpc: data, run: after } });
}
