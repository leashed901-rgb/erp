import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/tax/sales-filings/[id]/pay — registry action tax.pay_filing →
 * acct_pay_sales_tax_filing. Body: { bankAccountId, paymentDate?, amount? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.bankAccountId) return err('VALIDATION', 'bankAccountId is required', 400);
  const sb = supabaseAdmin();
  const { data: filing } = await sb.from('acct_tax_filings').select('id').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!filing) return err('NOT_FOUND', 'Filing not found', 404);
  const { data, error } = await sb.rpc('acct_pay_sales_tax_filing', {
    p_filing_id: id,
    p_bank_account_id: String(body.bankAccountId),
    p_payment_date: body.paymentDate ? String(body.paymentDate) : new Date().toISOString().slice(0, 10),
    p_amount: body.amount != null ? Number(body.amount) : null,
    p_adjustment_account_id: body.adjustmentAccountId ? String(body.adjustmentAccountId) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: after } = await sb.from('acct_tax_filings').select('*').eq('id', id).single();
  return NextResponse.json({ data: { rpc: data, filing: after } });
}
