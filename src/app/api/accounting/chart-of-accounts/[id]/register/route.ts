import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { RegisterLine } from '@/lib/acctTypes';

/* Account register: the account's posted, non-reversal journal lines
   (acct_journal_lines joined to acct_journal_entries), signed by the
   account's normal balance, oldest first so the running balance in
   the drawer reads chronologically. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: acct, error: acctErr } = await sb
    .from('acct_chart_of_accounts')
    .select('id, normal_balance, opening_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (acctErr) return err('INTERNAL', acctErr.message, 500);
  if (!acct) return err('NOT_FOUND', 'Account not found', 404);
  const a = acct as { normal_balance: string; opening_balance: number };

  const { data: entries, error: entErr } = await sb
    .from('acct_journal_entries')
    .select('id, entry_no, entry_date, source, memo, reference')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'posted')
    .is('reversal_of_id', null);
  if (entErr) return err('INTERNAL', entErr.message, 500);
  const entryById = new Map(((entries || []) as Record<string, unknown>[]).map((e) => [String(e.id), e]));

  const { data: lines, error: lineErr } = await sb
    .from('acct_journal_lines')
    .select('journal_entry_id, description, debit, credit, line_no')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('account_id', id)
    .order('line_no', { ascending: true })
    .limit(2000);
  if (lineErr) return err('INTERNAL', lineErr.message, 500);

  const out: RegisterLine[] = [];
  for (const l of (lines || []) as Record<string, unknown>[]) {
    const entry = entryById.get(String(l.journal_entry_id));
    if (!entry) continue;
    const amount = a.normal_balance === 'credit'
      ? Number(l.credit || 0) - Number(l.debit || 0)
      : Number(l.debit || 0) - Number(l.credit || 0);
    out.push({
      date: String(entry.entry_date || ''),
      description: String(l.description || entry.memo || entry.reference || entry.source || ''),
      amount,
      entryNo: Number(entry.entry_no || 0),
      source: String(entry.source || ''),
    });
  }
  out.sort((x, y) => x.date.localeCompare(y.date) || x.entryNo - y.entryNo);
  const activity = out.reduce((s, l) => s + l.amount, 0);
  const opening = Number(a.opening_balance || 0);
  return NextResponse.json({
    data: {
      openingBalance: opening,
      activity,
      closingBalance: opening + activity,
      lines: out,
    },
  });
}
