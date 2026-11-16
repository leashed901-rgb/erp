import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Mark journal lines cleared/uncleared on a reconciliation —
   acct_reconciliation_mark owns the item rows. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const journalLineIds = Array.isArray(body.journalLineIds) ? body.journalLineIds.filter((x): x is string => typeof x === 'string') : [];
  const cleared = body.cleared !== false;
  if (!journalLineIds.length) return err('VALIDATION', 'journalLineIds is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_reconciliation_mark', {
    p_reconciliation_id: id,
    p_journal_line_ids: journalLineIds,
    p_cleared: cleared,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, marked: typeof data === 'number' ? data : journalLineIds.length, cleared } });
}
