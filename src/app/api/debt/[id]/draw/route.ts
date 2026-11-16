import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/debt/[id]/draw — acct_record_debt_draw. Draws funds into a
 * bank account (posts the draw journal; fees ride on the fees account
 * when the instrument has one). Returns the journal id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const date = String(body.date || '').slice(0, 10);
  if (!body.toBankAccountId) return err('VALIDATION', 'Destination bank account is required', 400);
  if (!date) return err('VALIDATION', 'Date is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'Amount must be positive', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_record_debt_draw', {
    p_debt_id: id,
    p_to_bank_account_id: body.toBankAccountId,
    p_date: date,
    p_amount: amount,
    p_fees: body.fees != null ? Number(body.fees) : null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { journalId: data } });
}
