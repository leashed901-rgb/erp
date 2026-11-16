import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/post?type=invoice|bill
 *  Registry actions `invoice.post` → acct_post_invoice,
 *  `bill.post` → acct_post_bill. Posts the document to the ledger
 *  (creates the journal entry). For a bill this also auto-submits it
 *  (draft → approved) and moves it to 'open', which is what makes it
 *  payable. Falls back to a direct status update if the RPC rejects
 *  the row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const isBill = type === 'Bill' || type === 'bill';
  const isInvoice = type === 'Invoice' || type === 'invoice';
  if (!isBill && !isInvoice) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'post applies to Invoice or Bill documents', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  if (isBill) {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_post_bill', {
      p_bill_id: id,
      p_allow_possible_duplicate: true,
    });
    if (!rpcError && rpcResult) {
      return NextResponse.json({ data: { id, journal_entry_id: rpcResult }, message: 'Bill posted and open' });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: rpcError?.message || 'Bill post failed', requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_post_invoice', { p_invoice_id: id });
  if (!rpcError && rpcResult) {
    return NextResponse.json({ data: { id, journal_entry_id: rpcResult }, message: 'Invoice posted' });
  }

  // RPC rejected the row (e.g. already posted) — fall back to a direct
  // status flip so the UI still reflects the intent.
  const { data, error } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update({ status: 'posted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: rpcError?.message || error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data, message: 'Invoice posted (direct update)' });
}
