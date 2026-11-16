import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Match candidates for a receipt: the platform matcher
   acct_match_receipts proposes receipt ↔ bank-transaction pairs; this
   route returns its pairs for THIS receipt, plus any still-unmatched
   bank transactions at the same amount within ±10 days so the menu
   is useful before the matcher has run. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: inbox, error: readErr } = await sb
    .from('acct_document_inbox')
    .select('id, total, doc_date, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!inbox) return err('NOT_FOUND', 'Receipt not found', 404);
  const row = inbox as { total: number | null; doc_date: string | null; created_at: string };
  const { data: ext } = await sb
    .from('acct_receipt_extractions')
    .select('extracted_total, receipt_date')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('inbox_id', id)
    .maybeSingle();
  const total = (ext as { extracted_total?: number } | null)?.extracted_total ?? row.total;
  const dateStr = (ext as { receipt_date?: string } | null)?.receipt_date || row.doc_date || row.created_at.slice(0, 10);

  const candidateIds = new Set<string>();
  const { data: matched } = await sb.rpc('acct_match_receipts', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_days: 5,
    p_min_similarity: 0.3,
  });
  for (const m of (Array.isArray(matched) ? matched : []) as Record<string, unknown>[]) {
    const receiptKey = String(m.inbox_id || m.receipt_id || m.document_id || '');
    const txnKey = String(m.bank_transaction_id || m.transaction_id || '');
    if (receiptKey === id && txnKey) candidateIds.add(txnKey);
  }

  if (total != null) {
    const center = new Date(`${dateStr}T00:00:00`);
    const from = new Date(center);
    from.setDate(from.getDate() - 10);
    const to = new Date(center);
    to.setDate(to.getDate() + 10);
    const { data: sameAmount } = await sb
      .from('acct_bank_transactions')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('amount', -Math.abs(Number(total)))
      .gte('transaction_date', from.toISOString().slice(0, 10))
      .lte('transaction_date', to.toISOString().slice(0, 10))
      .is('receipt_attachment_id', null);
    for (const t of (sameAmount || []) as { id: string }[]) candidateIds.add(String(t.id));
  }

  if (!candidateIds.size) return NextResponse.json({ data: [] });
  const { data: txns } = await sb
    .from('acct_bank_transactions')
    .select('id, description, transaction_date, amount, bank_account_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('id', [...candidateIds]);
  const { data: bankAccts } = await sb.from('acct_bank_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID);
  const bankNames = new Map(((bankAccts || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name || '')]));
  return NextResponse.json({
    data: ((txns || []) as Record<string, unknown>[]).map((t) => ({
      bankTransactionId: String(t.id),
      description: String(t.description || ''),
      date: String(t.transaction_date || ''),
      amount: Number(t.amount || 0),
      bankAccountName: bankNames.get(String(t.bank_account_id)) || null,
    })),
  });
}
