import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const ROUND_TYPES = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'bridge', 'other'];

/** POST /api/cap/rounds — creates a funding round (cap_funding_rounds). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return err('VALIDATION', 'Round name is required.');
    const roundType = String(body.round_type ?? body.type ?? 'seed');
    if (!ROUND_TYPES.includes(roundType)) return err('VALIDATION', `round_type must be one of: ${ROUND_TYPES.join(', ')}`);
    const { data, error } = await supabaseAdmin()
      .from('cap_funding_rounds')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        name,
        round_type: roundType,
        share_class_id: body.share_class_id ?? null,
        pre_money_valuation: body.pre_money_valuation != null ? Number(body.pre_money_valuation) : body.pre_money != null ? Number(body.pre_money) : null,
        target_amount: body.target_amount != null ? Number(body.target_amount) : body.amount != null ? Number(body.amount) : null,
        price_per_share: body.price_per_share != null ? Number(body.price_per_share) : null,
        pool_target_pct: body.pool_target_pct != null ? Number(body.pool_target_pct) : null,
        option_pool_id: body.option_pool_id ?? null,
        status: body.status ?? 'planned',
        board_consent_document_id: body.board_consent_document_id ?? null,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create funding round.';
    return err('CREATE_FAILED', message);
  }
}
