import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/journal-entries — journal list. Filters: ?status=, ?from=,
 *  ?to=, ?account_id= (entries touching that account). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const accountId = searchParams.get('account_id');

  let query = supabaseAdmin()
    .from('acct_journal_entries')
    .select('id, entry_no, entry_date, posting_date, source, reference, memo, currency, total_debit, total_credit, status, is_adjusting, is_closing, reversal_of_id, reversed_by_id, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('posting_date', { ascending: false })
    .order('entry_no', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  if (from) query = query.gte('posting_date', from);
  if (to) query = query.lte('posting_date', to);
  if (accountId) {
    // Entries touching this account — resolve via the lines table.
    const { data: lines } = await supabaseAdmin()
      .from('acct_journal_lines')
      .select('journal_entry_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('account_id', accountId);
    const ids = [...new Set((lines || []).map((l) => l.journal_entry_id))];
    if (ids.length === 0) return NextResponse.json({ data: [], meta: { total: 0 } });
    query = query.in('id', ids);
  }
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data || [], meta: { total: (data || []).length } });
}

/** POST /api/journal-entries — create.journal_entry via acct_post_entry.
 *  Debits must equal credits (the balance check bar, enforced server-side).
 *  The RPC resolves book/period, enforces period locks, and posts the
 *  entry + batch in one call. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const lines = body.lines as { account_id: string; debit?: number; credit?: number; description?: string; memo?: string }[] | undefined;
  if (!Array.isArray(lines) || lines.length < 2) {
    return err('VALIDATION', 'A journal entry needs at least 2 lines', 400);
  }
  const entryDate = String(body.entry_date || body.date || new Date().toISOString().slice(0, 10));
  let totalDebit = 0;
  let totalCredit = 0;
  const rpcLines = [];
  for (const l of lines) {
    if (!l.account_id) return err('VALIDATION', 'Every line needs an account_id', 400);
    const debit = Number(l.debit || 0);
    const credit = Number(l.credit || 0);
    if (debit < 0 || credit < 0) return err('VALIDATION', 'Line amounts cannot be negative', 400);
    if (debit > 0 && credit > 0) return err('VALIDATION', 'A line cannot have both a debit and a credit', 400);
    totalDebit += debit;
    totalCredit += credit;
    rpcLines.push({
      account_id: l.account_id,
      debit,
      credit,
      description: l.description || l.memo || null,
    });
  }
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.005) {
    return err('VALIDATION', `Entry is out of balance: debits $${totalDebit.toFixed(2)} vs credits $${totalCredit.toFixed(2)}`, 400);
  }

  // Resolve the default entity the same way the invoice trigger does.
  const { data: entityId } = await supabaseAdmin().rpc('acct_default_entity', {
    p_tenant_id: DEFAULT_TENANT_ID,
  });
  if (!entityId) return err('CONFIG', 'No default entity for this tenant', 500);

  const { data, error } = await supabaseAdmin().rpc('acct_post_entry', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: entityId,
    p_entry_date: entryDate,
    p_lines: rpcLines,
    p_source: (body.source as string) || 'manual',
    p_reference: (body.reference as string) || null,
    p_memo: (body.memo as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: entry } = await supabaseAdmin()
    .from('acct_journal_entries')
    .select('id, entry_no, entry_date, posting_date, source, reference, memo, currency, total_debit, total_credit, status')
    .eq('id', data)
    .single();
  return NextResponse.json({ data: entry || { id: data }, message: 'Journal entry posted' }, { status: 201 });
}
