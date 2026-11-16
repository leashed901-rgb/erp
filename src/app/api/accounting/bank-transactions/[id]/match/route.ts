import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Match a bank transaction to an existing journal line via the
   platform RPC acct_match_bank_transaction. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const journalLineId = typeof body.journalLineId === 'string' ? body.journalLineId : null;
  if (!journalLineId) return err('VALIDATION', 'journalLineId is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_match_bank_transaction', {
    p_bank_txn_id: id,
    p_journal_line_id: journalLineId,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? { id, matched: true } });
}
