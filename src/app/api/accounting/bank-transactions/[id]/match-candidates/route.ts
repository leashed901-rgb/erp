import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Match candidates from the platform RPC acct_bank_match_candidates —
   journal lines the transaction could be matched to. The RPC's row
   shape is mapped defensively to the fields the picker renders. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const days = Number(req.nextUrl.searchParams.get('days') || 10);
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_bank_match_candidates', {
    p_bank_txn_id: id,
    p_days: Number.isFinite(days) ? days : 10,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return NextResponse.json({
    data: rows.map((r) => ({
      journalLineId: String(r.journal_line_id || r.line_id || r.id || ''),
      description: String(r.description || r.memo || r.reference || 'Journal line'),
      amount: Number(r.amount ?? r.debit ?? r.credit ?? 0),
      date: String(r.entry_date || r.date || r.transaction_date || ''),
      entryNo: r.entry_no != null ? Number(r.entry_no) : null,
    })),
  });
}
