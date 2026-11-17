import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/fixed-assets/[id]/dispose — acct_dispose_fixed_asset.
 * Writes off the remaining book value, books the gain/loss, and
 * deposits the proceeds into the bank account given.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || '').slice(0, 10);
  const proceeds = Number(body.proceeds);
  if (!date) return err('VALIDATION', 'Disposal date is required', 400);
  if (!Number.isFinite(proceeds) || proceeds < 0) return err('VALIDATION', 'Proceeds must be zero or more', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_dispose_fixed_asset', {
    p_asset_id: id,
    p_date: date,
    p_proceeds: proceeds,
    p_deposit_bank_account_id: body.depositBankAccountId || null,
    p_memo: body.memo ? String(body.memo) : null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { journalId: data } });
}
