import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/gift-cards/redeem { code, invoice_id, amount } —
 * redeem against a posted invoice with open balance via
 * acct_redeem_gift_card: the RPC books liability → A/R, records the
 * customer receipt, and decrements the card balance. Returns the
 * updated card.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const code = String(body.code || '').toUpperCase();
  const invoiceId = String(body.invoice_id || '');
  const amount = Number(body.amount);
  if (!code || !invoiceId || !amount || amount <= 0) {
    return err('VALIDATION', 'code, invoice_id and a positive amount are required', 400);
  }
  const db = supabaseAdmin();
  const { data: receiptId, error } = await db.rpc('acct_redeem_gift_card', {
    p_code: code,
    p_tenant_id: DEFAULT_TENANT_ID,
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_date: new Date().toISOString().slice(0, 10),
  });
  if (error) return err('RPC', error.message, 422);

  const { data: card } = await db
    .from('acct_gift_cards')
    .select('id, code, status, initial_amount, balance, currency')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', code)
    .single();
  return NextResponse.json({ data: { receiptId, card } });
}
