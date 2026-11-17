import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/cap/rounds/[id]/close — cap_close_round RPC: prices the round from
 * the model, tops up the pool, issues shares to each investor (journals post
 * to the bank account when one is given), converts outstanding SAFEs/notes,
 * and closes the round. Body: { investments: [{stakeholder_id, amount}],
 * close_date, bank_account_id? }
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const investments = Array.isArray(body.investments) ? body.investments : [];
    if (investments.length === 0) return err('VALIDATION', 'investments (at least one {stakeholder_id, amount}) is required.');
    for (const inv of investments as Record<string, unknown>[]) {
      if (!inv.stakeholder_id || !Number.isFinite(Number(inv.amount)) || Number(inv.amount) <= 0) {
        return err('VALIDATION', 'Each investment needs a stakeholder_id and a positive amount.');
      }
    }
    const closeDate = String(body.close_date ?? new Date().toISOString().slice(0, 10));
    const { data, error } = await supabaseAdmin().rpc('cap_close_round', {
      p_round_id: id,
      p_investments: investments,
      p_close_date: closeDate,
      p_bank_account_id: body.bank_account_id ?? null,
    });
    if (error) return err('CLOSE_FAILED', error.message);
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to close round.';
    return err('CLOSE_FAILED', message);
  }
}
