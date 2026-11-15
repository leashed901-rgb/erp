import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/bank-transactions/[id]/match — wraps acct_match_bank_transaction RPC.
 *  Body: { document_id, document_type? }
 *  Links a bank txn to an invoice/bill payment. Fallback: flip status to matched. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const documentId = body.document_id as string | undefined;
  if (!documentId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'document_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_match_bank_transaction', {
    bank_txn_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
    document_uuid: documentId,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { matched: true, source: 'rpc' } });
  }

  // 2. Fallback: flip the txn's match_status + matched_doc_id.
  const update: Record<string, unknown> = {
    match_status: 'matched',
    matched_doc_id: documentId,
    matched_doc_type: (body.document_type as string | undefined) || null,
    reviewed_at: new Date().toISOString(),
  };
  const { data: updated, error: updErr } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, match_status, matched_doc_id')
    .single();
  if (updErr) {
    // matched_doc_type may not exist — retry with just match_status + matched_doc_id.
    const { data: u2, error: e2 } = await supabaseAdmin()
      .from('acct_bank_transactions')
      .update({ match_status: 'matched', matched_doc_id: documentId, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .select('id, match_status, matched_doc_id')
      .single();
    if (e2) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: e2.message } }, { status: 500 });
    }
    return NextResponse.json({ data: { matched: true, txn: u2, source: 'fallback' } });
  }
  return NextResponse.json({ data: { matched: true, txn: updated, source: 'fallback' } });
}
