import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Live tie-out for one reconciliation — acct_reconciliation_summary. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_reconciliation_summary', { p_reconciliation_id: id });
  if (error) return err('INTERNAL', error.message, 500);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return err('NOT_FOUND', 'Reconciliation not found', 404);
  return NextResponse.json({
    data: {
      beginningBalance: Number(row.beginning_balance || 0),
      clearedDeposits: Number(row.cleared_deposits || 0),
      clearedPayments: Number(row.cleared_payments || 0),
      clearedBalance: Number(row.cleared_balance || 0),
      statementEndingBalance: Number(row.statement_ending_balance || 0),
      difference: Number(row.difference || 0),
      unclearedCount: Number(row.uncleared_count || 0),
    },
  });
}
