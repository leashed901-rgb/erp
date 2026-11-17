import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Exclude / restore via the platform RPC acct_exclude_bank_transaction
   (p_undo restores the transaction to for_review). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { error } = await sb.rpc('acct_exclude_bank_transaction', {
    p_bank_txn_id: id,
    p_reason: typeof body.reason === 'string' ? body.reason : null,
    p_undo: body.undo === true,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, excluded: body.undo !== true } });
}
