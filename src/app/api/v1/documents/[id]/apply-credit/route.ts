import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/v1/documents/[id]/apply-credit?type=Invoice|Bill — apply a
 * credit to this document via the engine RPCs, which write the
 * application rows:
 *  - Invoice: acct_apply_credit_memo(p_memo_id, p_invoice_id, p_amount)
 *  - Bill: acct_apply_vendor_credit(p_credit_id, p_bill_id, p_amount)
 * Body: { creditId, amount }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const type = (req.nextUrl.searchParams.get('type') || 'Invoice').toLowerCase();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.creditId) return err('VALIDATION', 'creditId is required', 400);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount must be greater than 0', 400);
  const sb = supabaseAdmin();
  if (type === 'bill') {
    const { data: bill } = await sb.from('acct_ap_bills').select('id').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
    if (!bill) return err('NOT_FOUND', 'Bill not found', 404);
    const { error } = await sb.rpc('acct_apply_vendor_credit', {
      p_credit_id: String(body.creditId),
      p_bill_id: id,
      p_amount: amount,
    });
    if (error) return err('VALIDATION', error.message, 400);
    return NextResponse.json({ data: { applied: true, amount } }, { status: 201 });
  }
  const { data: inv } = await sb.from('acct_ar_invoices').select('id').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!inv) return err('NOT_FOUND', 'Invoice not found', 404);
  const { error } = await sb.rpc('acct_apply_credit_memo', {
    p_memo_id: String(body.creditId),
    p_invoice_id: id,
    p_amount: amount,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: { applied: true, amount } }, { status: 201 });
}
