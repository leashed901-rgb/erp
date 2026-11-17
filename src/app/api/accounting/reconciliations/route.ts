import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Reconciliation workspace + start. The platform owns the lifecycle:
   acct_start_reconciliation creates the acct_reconciliations row,
   acct_reconciliation_mark flips items, acct_reconciliation_summary
   computes the tie-out, acct_finish_reconciliation closes it.
   The workspace lists the bank account's GL journal lines that no
   finished reconciliation has cleared yet. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const bankAccountId = req.nextUrl.searchParams.get('bankAccountId');
  if (!bankAccountId) return err('VALIDATION', 'bankAccountId is required', 400);
  const sb = supabaseAdmin();

  const { data: bankAcct } = await sb
    .from('acct_bank_accounts')
    .select('id, gl_account_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', bankAccountId)
    .maybeSingle();
  if (!bankAcct) return err('NOT_FOUND', 'Bank account not found', 404);
  const glAccountId = String((bankAcct as { gl_account_id: string }).gl_account_id);

  const { data: gl } = await sb
    .from('acct_chart_of_accounts')
    .select('normal_balance, opening_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', glAccountId)
    .maybeSingle();
  const normalBalance = String((gl as { normal_balance?: string } | null)?.normal_balance || 'debit');
  const opening = Number((gl as { opening_balance?: number } | null)?.opening_balance || 0);
  const sign = (debit: number, credit: number) => (normalBalance === 'credit' ? credit - debit : debit - credit);

  /* Reconciliations for this account: find the active one and the set
     of lines cleared by finished ones */
  const { data: recs } = await sb
    .from('acct_reconciliations')
    .select('id, status, as_of_date, statement_balance, beginning_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('bank_account_id', bankAccountId)
    .order('created_at', { ascending: false });
  const recRows = (recs || []) as Record<string, unknown>[];
  const active = recRows.find((r) => r.status === 'open' || r.status === 'in_progress' || r.status === 'reopened') || null;
  const finishedIds = recRows.filter((r) => r.status === 'reconciled' || r.status === 'closed').map((r) => String(r.id));

  /* Cleared state lives on the journal lines themselves
     (cleared_status + reconciliation_id — see acct_reconciliation_mark).
     Lines a finished reconciliation closed are 'reconciled' and drop
     out of the workspace; a line belongs to the active reconciliation
     when its reconciliation_id points at it. */
  const { data: entries } = await sb
    .from('acct_journal_entries')
    .select('id, posting_date, entry_no')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('status', ['posted', 'reversed']);
  const entryRows = (entries || []) as Record<string, unknown>[];
  const entryById = new Map(entryRows.map((e) => [String(e.id), e]));
  const { data: lines } = entryRows.length
    ? await sb
        .from('acct_journal_lines')
        .select('id, journal_entry_id, debit, credit, description, cleared_status, reconciliation_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('account_id', glAccountId)
        .in('journal_entry_id', entryRows.map((e) => String(e.id)))
    : { data: [] };
  const activeId = active ? String(active.id) : null;
  const lineRows = ((lines || []) as Record<string, unknown>[]).map((l) => {
    const entry = entryById.get(String(l.journal_entry_id));
    return {
      id: String(l.id),
      date: String(entry?.posting_date || ''),
      entryNo: entry?.entry_no != null ? Number(entry.entry_no) : null,
      description: String(l.description || 'Journal line'),
      amount: Math.round(sign(Number(l.debit || 0), Number(l.credit || 0)) * 100) / 100,
      clearedStatus: String(l.cleared_status || 'uncleared'),
      reconciliationId: (l.reconciliation_id as string) || null,
    };
  });

  /* Beginning balance = opening + everything already reconciled;
     the workspace shows only lines not yet reconciled */
  const beginningBalance = Math.round((opening + lineRows.filter((l) => l.clearedStatus === 'reconciled').reduce((s, l) => s + l.amount, 0)) * 100) / 100;
  const workspaceLines = lineRows
    .filter((l) => l.clearedStatus !== 'reconciled')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({
      id: l.id,
      date: l.date,
      entryNo: l.entryNo,
      description: l.description,
      amount: l.amount,
      cleared: activeId != null && l.reconciliationId === activeId,
    }));

  return NextResponse.json({
    data: {
      bankAccountId,
      glAccountId,
      beginningBalance,
      active: active
        ? {
            id: String(active.id),
            status: String(active.status),
            statementEndDate: (active.as_of_date as string) || null,
            statementEndingBalance: active.statement_balance != null ? Number(active.statement_balance) : null,
            beginningBalance: active.beginning_balance != null ? Number(active.beginning_balance) : beginningBalance,
          }
        : null,
      lines: workspaceLines,
      pastCount: finishedIds.length,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bankAccountId = typeof body.bankAccountId === 'string' ? body.bankAccountId : '';
  const statementEndDate = typeof body.statementEndDate === 'string' ? body.statementEndDate : '';
  const statementEndingBalance = typeof body.statementEndingBalance === 'number' ? body.statementEndingBalance : Number(body.statementEndingBalance);
  if (!bankAccountId) return err('VALIDATION', 'bankAccountId is required', 400);
  if (!statementEndDate) return err('VALIDATION', 'statementEndDate is required', 400);
  if (Number.isNaN(statementEndingBalance)) return err('VALIDATION', 'statementEndingBalance must be a number', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_start_reconciliation', {
    p_bank_account_id: bankAccountId,
    p_statement_end_date: statementEndDate,
    p_statement_ending_balance: statementEndingBalance,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: String(data) } }, { status: 201 });
}
