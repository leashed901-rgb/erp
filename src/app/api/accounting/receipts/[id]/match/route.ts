import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Match a receipt to a bank transaction: the link lands on
   acct_document_inbox.matched_bank_transaction_id, the extraction
   row, and the bank transaction's receipt_attachment_id when the
   intake carries an attachment. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bankTransactionId = typeof body.bankTransactionId === 'string' ? body.bankTransactionId : null;
  if (!bankTransactionId) return err('VALIDATION', 'bankTransactionId is required', 400);
  const sb = supabaseAdmin();
  const { data: inbox, error: readErr } = await sb
    .from('acct_document_inbox')
    .select('id, attachment_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!inbox) return err('NOT_FOUND', 'Receipt not found', 404);
  const attachmentId = (inbox as { attachment_id: string | null }).attachment_id;

  const { error } = await sb
    .from('acct_document_inbox')
    .update({ matched_bank_transaction_id: bankTransactionId, status: 'processed' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  await sb
    .from('acct_receipt_extractions')
    .update({ matched_bank_transaction_id: bankTransactionId })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('inbox_id', id);
  if (attachmentId) {
    await sb
      .from('acct_bank_transactions')
      .update({ receipt_attachment_id: attachmentId })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', bankTransactionId);
  }
  return NextResponse.json({ data: { id, bankTransactionId, matched: true } });
}
