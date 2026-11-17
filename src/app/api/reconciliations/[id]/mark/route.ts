import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/reconciliations/[id]/mark — toggle cleared on journal
 *  lines (acct_reconciliation_mark). Returns the fresh summary so the
 *  Difference meter updates from the server, not from local math. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const journalLineIds = body.journal_line_ids as string[] | undefined;
  const cleared = body.cleared !== false;
  if (!Array.isArray(journalLineIds) || journalLineIds.length === 0) {
    return err('VALIDATION', 'journal_line_ids is required', 400);
  }
  const { data: rec } = await supabaseAdmin()
    .from('acct_reconciliations')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!rec) return err('NOT_FOUND', 'Reconciliation not found', 404);
  if (rec.status === 'reconciled' || rec.status === 'closed') {
    return err('VALIDATION', `Reconciliation is ${rec.status} — reopen it before changing cleared items`, 400);
  }
  const { data: marked, error } = await supabaseAdmin().rpc('acct_reconciliation_mark', {
    p_reconciliation_id: id,
    p_journal_line_ids: journalLineIds,
    p_cleared: cleared,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: summary } = await supabaseAdmin().rpc('acct_reconciliation_summary', {
    p_reconciliation_id: id,
  });
  return NextResponse.json({
    data: { marked: marked ?? 0, summary: summary?.[0] || null },
    message: `${marked ?? 0} item${(marked ?? 0) === 1 ? '' : 's'} marked ${cleared ? 'cleared' : 'uncleared'}`,
  });
}
