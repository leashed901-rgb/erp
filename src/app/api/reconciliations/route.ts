import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/reconciliations — open and past reconciliations. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bankAccountId = searchParams.get('bank_account_id');
  const status = searchParams.get('status');
  let query = supabaseAdmin()
    .from('acct_reconciliations')
    .select('id, bank_account_id, as_of_date, statement_balance, gl_balance, outstanding_deposits, outstanding_payments, adjustments, difference, status, beginning_balance, service_charge_amount, interest_earned_amount, completed_at, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('as_of_date', { ascending: false })
    .limit(100);
  if (bankAccountId) query = query.eq('bank_account_id', bankAccountId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set((data || []).map((r) => r.bank_account_id))];
  const { data: accounts } = accountIds.length
    ? await supabaseAdmin().from('acct_bank_accounts').select('id, name').in('id', accountIds)
    : { data: [] };
  const byId = new Map((accounts || []).map((a) => [a.id, a]));
  return NextResponse.json({
    data: (data || []).map((r) => ({ ...r, bank_account_name: byId.get(r.bank_account_id)?.name || null })),
    meta: { total: (data || []).length },
  });
}

/** POST /api/reconciliations — create.reconcile via
 *  acct_start_reconciliation: account + statement ending balance/date,
 *  optional service charge and interest earned (each with its own
 *  account, posted as journals by the RPC). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const bankAccountId = body.bank_account_id as string | undefined;
  const asOfDate = String(body.statement_end_date || body.as_of_date || '');
  const statementBalance = Number(body.statement_ending_balance ?? body.statement_balance);
  if (!bankAccountId) return err('VALIDATION', 'bank_account_id is required', 400);
  if (!asOfDate) return err('VALIDATION', 'statement_end_date is required', 400);
  if (Number.isNaN(statementBalance)) return err('VALIDATION', 'statement_ending_balance is required', 400);

  const { data: account } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!account) return err('NOT_FOUND', 'Bank account not found', 404);

  const { data, error } = await supabaseAdmin().rpc('acct_start_reconciliation', {
    p_bank_account_id: bankAccountId,
    p_statement_end_date: asOfDate,
    p_statement_ending_balance: statementBalance,
    p_service_charge: Number(body.service_charge || 0),
    p_service_charge_date: (body.service_charge_date as string) || null,
    p_service_charge_account_id: (body.service_charge_account_id as string) || null,
    p_interest_earned: Number(body.interest_earned || 0),
    p_interest_date: (body.interest_date as string) || null,
    p_interest_account_id: (body.interest_account_id as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: rec } = await supabaseAdmin()
    .from('acct_reconciliations')
    .select('id, bank_account_id, as_of_date, statement_balance, gl_balance, outstanding_deposits, outstanding_payments, adjustments, difference, status, beginning_balance, service_charge_amount, interest_earned_amount, created_at')
    .eq('id', data)
    .single();
  return NextResponse.json({ data: rec || { id: data }, message: 'Reconciliation started' }, { status: 201 });
}
