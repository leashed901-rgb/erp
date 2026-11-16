import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** POST /api/cap/model-round — cap_model_round RPC (dilution modeler). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const preMoney = Number(body.pre_money ?? body.preMoney ?? 0);
    const investment = Number(body.investment ?? body.amount ?? 0);
    if (!Number.isFinite(preMoney) || preMoney <= 0) return err('VALIDATION', 'pre_money must be positive.');
    if (!Number.isFinite(investment) || investment < 0) return err('VALIDATION', 'investment must be >= 0.');
    const { data, error } = await supabaseAdmin().rpc('cap_model_round', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_pre_money: preMoney,
      p_investment: investment,
      p_pool_target_pct: body.pool_target_pct != null ? Number(body.pool_target_pct) : null,
      p_as_of: String(body.as_of ?? new Date().toISOString().slice(0, 10)),
      p_include_convertibles: body.include_convertibles !== undefined ? Boolean(body.include_convertibles) : true,
    });
    if (error) return err('MODEL_FAILED', error.message);
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to model round.';
    return err('MODEL_FAILED', message);
  }
}
