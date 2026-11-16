import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/journal-entries/[id] — entry + lines with account names. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: entry, error } = await supabaseAdmin()
    .from('acct_journal_entries')
    .select('id, entry_no, entry_date, posting_date, source, reference, memo, currency, total_debit, total_credit, status, is_adjusting, is_closing, reversal_of_id, reversed_by_id, created_at')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !entry) return err('NOT_FOUND', 'Journal entry not found', 404);
  const { data: lines } = await supabaseAdmin()
    .from('acct_journal_lines')
    .select('id, line_no, account_id, description, debit, credit, cleared_status')
    .eq('journal_entry_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('line_no', { ascending: true });
  const accountIds = [...new Set((lines || []).map((l) => l.account_id))];
  const { data: accounts } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id, code, name')
    .in('id', accountIds.length ? accountIds : ['00000000-0000-0000-0000-000000000000']);
  const byId = new Map((accounts || []).map((a) => [a.id, a]));
  return NextResponse.json({
    data: {
      ...entry,
      lines: (lines || []).map((l) => ({
        ...l,
        account_code: byId.get(l.account_id)?.code,
        account_name: byId.get(l.account_id)?.name,
      })),
    },
  });
}
