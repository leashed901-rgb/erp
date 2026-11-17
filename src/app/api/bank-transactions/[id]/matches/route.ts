import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/bank-transactions/[id]/matches — suggested docs for the
 *  Match drawer: journal lines near this transaction's date and amount
 *  (acct_bank_match_candidates), enriched with their entry + account. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: row } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, amount, transaction_date')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);

  const { data, error } = await supabaseAdmin().rpc('acct_bank_match_candidates', {
    p_bank_txn_id: id,
    p_days: 10,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const candidates = data || [];
  const lineIds = candidates.map((c: { journal_line_id: string }) => c.journal_line_id);
  const { data: lines } = lineIds.length
    ? await supabaseAdmin()
        .from('acct_journal_lines')
        .select('id, journal_entry_id, account_id, description, debit, credit')
        .in('id', lineIds)
    : { data: [] };
  const lineById = new Map((lines || []).map((l) => [l.id, l]));
  const entryIds = [...new Set((lines || []).map((l) => l.journal_entry_id))];
  const { data: entries } = entryIds.length
    ? await supabaseAdmin()
        .from('acct_journal_entries')
        .select('id, entry_no, source, reference, memo')
        .in('id', entryIds)
    : { data: [] };
  const entryById = new Map((entries || []).map((e) => [e.id, e]));
  const accountIds = [...new Set((lines || []).map((l) => l.account_id))];
  const { data: accounts } = accountIds.length
    ? await supabaseAdmin()
        .from('acct_chart_of_accounts')
        .select('id, code, name')
        .in('id', accountIds)
    : { data: [] };
  const accountById = new Map((accounts || []).map((a) => [a.id, a]));

  return NextResponse.json({
    data: candidates.map((c: Record<string, unknown>) => {
      const line = lineById.get(c.journal_line_id as string);
      const entry = line ? entryById.get(line.journal_entry_id) : undefined;
      const account = line ? accountById.get(line.account_id) : undefined;
      return {
        journal_line_id: c.journal_line_id,
        journal_entry_id: c.journal_entry_id,
        entry_no: c.entry_no,
        posting_date: c.posting_date,
        amount: Number(c.amount ?? 0),
        memo: c.memo,
        source: c.source,
        day_diff: c.day_diff,
        line_description: line?.description,
        account_code: account?.code,
        account_name: account?.name,
        entry_source: entry?.source,
        entry_reference: entry?.reference,
      };
    }),
    meta: { bank_transaction_id: id },
  });
}
