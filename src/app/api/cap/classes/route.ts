import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return err('VALIDATION', 'Class name is required.');
    const classType = String(body.class_type ?? 'common').toLowerCase();
    if (!['common', 'preferred'].includes(classType)) return err('VALIDATION', 'class_type must be common or preferred.');
    const authorized = Number(body.authorized_shares);
    if (!Number.isFinite(authorized) || authorized <= 0) return err('VALIDATION', 'Authorized shares must be positive.');

    const sb = supabaseAdmin();
    const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityErr) return err('ENTITY_FAILED', entityErr.message);

    const { data, error } = await sb
      .from('cap_share_classes')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId,
        name,
        class_type: classType,
        authorized_shares: authorized,
        par_value: body.par_value != null ? Number(body.par_value) : 0.0001,
        original_issue_price: body.price_per_share_original != null ? Number(body.price_per_share_original) : body.original_issue_price != null ? Number(body.original_issue_price) : null,
        liquidation_multiple: body.liquidation_preference_multiple != null ? Number(body.liquidation_preference_multiple) : body.liquidation_multiple != null ? Number(body.liquidation_multiple) : 1,
        participating: Boolean(body.participating),
        participation_cap_multiple: body.participation_cap_multiple != null ? Number(body.participation_cap_multiple) : null,
        seniority: body.seniority_rank != null ? Number(body.seniority_rank) : body.seniority != null ? Number(body.seniority) : 0,
        conversion_ratio: body.conversion_ratio != null ? Number(body.conversion_ratio) : 1,
        dividend_rate: body.dividend_rate != null ? Number(body.dividend_rate) : null,
        cumulative_dividends: Boolean(body.cumulative_dividends),
        votes_per_share: body.voting_rights === undefined ? 1 : Boolean(body.voting_rights) ? 1 : 0,
        has_put_or_call: Boolean(body.has_put_call_redemption ?? body.has_put_or_call),
        rofr_only: body.rofr_only !== undefined ? Boolean(body.rofr_only) : true,
        terms: body.terms ?? {},
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create security class.';
    return err('CREATE_FAILED', message);
  }
}
