import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/debt/[id]/pay — acct_record_debt_payment. Splits the
 * payment into interest (next scheduled installment's interest when
 * not given) and principal, refuses principal above the balance owed,
 * and marks the installment paid. Returns the journal id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const date = String(body.date || '').slice(0, 10);
  if (!body.fromBankAccountId) return err('VALIDATION', 'Paying bank account is required', 400);
  if (!date) return err('VALIDATION', 'Date is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'Amount must be positive', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_record_debt_payment', {
    p_debt_id: id,
    p_from_bank_account_id: body.fromBankAccountId,
    p_date: date,
    p_amount: amount,
    p_interest: body.interest != null ? Number(body.interest) : null,
    p_idempotency_key: body.idempotencyKey ? String(body.idempotencyKey) : null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { journalId: data } });
}
