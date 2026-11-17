import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/reconciliations/[id] — the workspace: the reconciliation,
 *  its live summary (Difference meter), its items, and the uncleared
 *  journal lines for the bank account that can still be cleared. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: rec, error } = await sb
    .from('acct_reconciliations')
    .select('id, bank_account_id, as_of_date, statement_balance, gl_balance, outstanding_deposits, outstanding_payments, adjustments, difference, status, beginning_balance, service_charge_amount, service_charge_date, service_charge_account_id, interest_earned_amount, interest_earned_date, interest_account_id, completed_at, created_at')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !rec) return err('NOT_FOUND', 'Reconciliation not found', 404);

  const { data: summary } = await sb.rpc('acct_reconciliation_summary', {
    p_reconciliation_id: id,
  });
  const { data: items } = await sb
    .from('acct_reconciliation_items')
    .select('id, bank_transaction_id, journal_line_id, item_type, amount, status, notes')
    .eq('reconciliation_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const { data: account } = await sb
    .from('acct_bank_accounts')
    .select('id, name, gl_account_id')
    .eq('id', rec.bank_account_id)
    .single();

  // All journal lines on the bank GL account — cleared and uncleared —
  // the toggleable rows. A line cleared in this reconciliation stays
  // visible (with cleared=true) so it can be un-cleared.
  let candidates: Record<string, unknown>[] = [];
  if (account?.gl_account_id) {
    const { data: lines } = await sb
      .from('acct_journal_lines')
      .select('id, journal_entry_id, description, debit, credit, cleared_status, reconciliation_id')
      .eq('account_id', account.gl_account_id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('cleared_status', ['uncleared', 'cleared'])
      .order('id', { ascending: true })
      .limit(200);
    const entryIds = [...new Set((lines || []).map((l) => l.journal_entry_id))];
    const { data: entries } = entryIds.length
      ? await sb
          .from('acct_journal_entries')
          .select('id, entry_no, posting_date, source, reference, memo')
          .in('id', entryIds)
      : { data: [] };
    const entryById = new Map((entries || []).map((e) => [e.id, e]));
    candidates = (lines || []).map((l) => {
      const e = entryById.get(l.journal_entry_id);
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      return {
        journal_line_id: l.id,
        journal_entry_id: l.journal_entry_id,
        entry_no: e?.entry_no,
        posting_date: e?.posting_date,
        source: e?.source,
        reference: e?.reference,
        description: l.description || e?.memo,
        amount: debit > 0 ? debit : -credit,
        type: debit > 0 ? 'deposit' : 'payment',
        cleared: l.cleared_status === 'cleared',
        reconciliation_id: l.reconciliation_id,
      };
    });
  }

  return NextResponse.json({
    data: {
      ...rec,
      bank_account_name: account?.name || null,
      summary: summary?.[0] || null,
      items: items || [],
      candidates,
    },
  });
}
