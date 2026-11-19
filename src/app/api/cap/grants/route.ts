import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** POST /api/cap/grants — cap_grant_options RPC (pool availability + 409A FMV guard in SQL). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const poolId = String(body.pool_id ?? body.plan_id ?? '');
    const stakeholderId = String(body.stakeholder_id ?? '');
    const shares = Number(body.shares ?? body.quantity ?? 0);
    const exercisePrice = Number(body.exercise_price ?? body.price_per_share ?? 0);
    const grantedOn = String(body.granted_on ?? body.grant_date ?? '');
    if (!poolId) return err('VALIDATION', 'pool_id is required.');
    if (!stakeholderId) return err('VALIDATION', 'stakeholder_id is required.');
    if (!Number.isFinite(shares) || shares <= 0) return err('VALIDATION', 'shares must be positive.');
    if (!Number.isFinite(exercisePrice) || exercisePrice < 0) return err('VALIDATION', 'exercise_price must be >= 0.');
    if (!grantedOn) return err('VALIDATION', 'granted_on is required.');
    const grantType = String(body.grant_type ?? body.iso_nso ?? 'iso').toLowerCase();
    if (!['iso', 'nso', 'rsu', 'sar'].includes(grantType)) return err('VALIDATION', 'grant_type must be iso, nso, rsu, or sar.');

    const { data, error } = await supabaseAdmin().rpc('cap_grant_options', {
      p_pool_id: poolId,
      p_stakeholder_id: stakeholderId,
      p_shares: shares,
      p_exercise_price: exercisePrice,
      p_granted_on: grantedOn,
      p_vesting_start: body.vesting_start ?? null,
      p_vesting_months: body.vesting_months != null ? Number(body.vesting_months) : 48,
      p_cliff_months: body.cliff_months != null ? Number(body.cliff_months) : 12,
      p_grant_type: grantType,
      p_board_consent_document_id: body.board_consent_document_id ?? body.board_approval_id ?? null,
      p_expires_on: body.expires_on ?? null,
    });
    if (error) return err('GRANT_FAILED', error.message);
    // cap_grant_options has no early_exercise parameter; the column exists
    // on the row (it gates exercising unvested shares, and the 83(b) flow).
    if (body.early_exercise !== undefined) {
      const { error: updErr } = await supabaseAdmin()
        .from('cap_option_grants')
        .update({ early_exercise: Boolean(body.early_exercise) })
        .eq('id', data);
      if (updErr) return err('GRANT_FAILED', updErr.message);
    }
    return NextResponse.json({ data: { id: data } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to grant equity award.';
    return err('GRANT_FAILED', message);
  }
}
