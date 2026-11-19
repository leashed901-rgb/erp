import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/cap/companies — upserts the issuer profile (cap_issuer_profiles,
 * one per entity) and updates the entity's display/legal name in acct_entities.
 * Body: { name?, state_of_incorporation, incorporated_on, fiscal_year_end?,
 *   has_traded_class?, predecessor_start_date?, anticipated_change_in_control_on?,
 *   anticipated_ipo_on? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = String(body.state_of_incorporation ?? '').trim();
    const incorporatedOn = String(body.incorporated_on ?? '');
    if (!state) return err('VALIDATION', 'state_of_incorporation is required.');
    if (!incorporatedOn) return err('VALIDATION', 'incorporated_on is required.');

    const sb = supabaseAdmin();
    const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityErr) return err('ENTITY_FAILED', entityErr.message);

    if (body.name) {
      const { error: nameErr } = await sb
        .from('acct_entities')
        .update({ legal_name: String(body.name).trim(), display_name: String(body.name).trim() })
        .eq('id', entityId);
      if (nameErr) return err('ENTITY_FAILED', nameErr.message);
    }

    const row = {
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      state_of_incorporation: state,
      incorporated_on: incorporatedOn,
      predecessor_start_date: body.predecessor_start_date ?? null,
      has_traded_class: Boolean(body.has_traded_class),
      anticipated_change_in_control_on: body.anticipated_change_in_control_on ?? null,
      anticipated_ipo_on: body.anticipated_ipo_on ?? null,
      fiscal_year_end: body.fiscal_year_end ?? '12-31',
    };
    const { data, error } = await sb
      .from('cap_issuer_profiles')
      .upsert(row, { onConflict: 'entity_id' })
      .select()
      .single();
    if (error) return err('UPSERT_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update company profile.';
    return err('UPSERT_FAILED', message);
  }
}
