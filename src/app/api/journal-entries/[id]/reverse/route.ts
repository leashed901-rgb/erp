import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/journal-entries/[id]/reverse — journal.reverse. Creates the
 *  reversing entry (same lines, debit/credit swapped) on the given date. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const { data: entry } = await supabaseAdmin()
    .from('acct_journal_entries')
    .select('id, status, reversed_by_id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!entry) return err('NOT_FOUND', 'Journal entry not found', 404);
  if (entry.status !== 'posted') {
    return err('VALIDATION', `Only a posted entry can be reversed (status is ${entry.status})`, 400);
  }
  if (entry.reversed_by_id) {
    return err('VALIDATION', 'This entry has already been reversed', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_reverse_journal', {
    p_journal_id: id,
    p_reversal_date: (body.reversal_date as string) || new Date().toISOString().slice(0, 10),
    p_memo: (body.memo as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: { id: data, reversed_entry_id: id }, message: 'Journal entry reversed' });
}
