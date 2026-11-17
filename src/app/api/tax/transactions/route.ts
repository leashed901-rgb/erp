import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * GET /api/tax/transactions?accountId=&year= — journal-line drill-down for
 * one account (the Tax summary "View transactions" / deduction source pill).
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const accountId = sp.get('accountId');
  const year = Number(sp.get('year')) || new Date().getFullYear();
  if (!accountId) return err('VALIDATION', 'accountId is required', 400);
  const sb = supabaseAdmin();

  const { data: entries } = await sb
    .from('acct_journal_entries')
    .select('id,entry_no,entry_date,memo,status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('status', ['posted', 'reversed'])
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`);
  const byId = new Map((entries || []).map((e) => [e.id, e]));
  if (!byId.size) return NextResponse.json({ data: [] });

  const { data: lines, error } = await sb
    .from('acct_journal_lines')
    .select('id,journal_entry_id,description,debit,credit')
    .eq('account_id', accountId)
    .in('journal_entry_id', [...byId.keys()])
    .limit(500);
  if (error) return err('INTERNAL', error.message, 500);

  const data = (lines || [])
    .map((l) => {
      const e = byId.get(l.journal_entry_id);
      return {
        id: l.id,
        entryNo: e?.entry_no ?? null,
        date: e?.entry_date ?? null,
        memo: l.description || e?.memo || '',
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return NextResponse.json({ data });
}
