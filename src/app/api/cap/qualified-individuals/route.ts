import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/cap/qualified-individuals — the tenant's valuation qualified
 *  individuals / independent appraisers (cap_qualified_individuals).
 *  The 409A safe-harbor gate (val__gate) reads this table: an
 *  independent_appraisal request passes only when it names a row here
 *  with is_independent = true. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('cap_qualified_individuals')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('full_name');
  if (error) return err('LIST_FAILED', error.message, 500);
  return NextResponse.json({ data: data || [] });
}

/** POST /api/cap/qualified-individuals — record a qualified individual.
 *  Body: { full_name, qualifications_summary, years_experience,
 *    experience_categories?, is_independent?, firm?, stakeholder_id?,
 *    determined_on?, board_approval_id? } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fullName = String(body.full_name ?? '').trim();
    if (!fullName) return err('VALIDATION', 'full_name is required.');
    const summary = String(body.qualifications_summary ?? '').trim();
    if (!summary) return err('VALIDATION', 'qualifications_summary is required.');
    const years = Number(body.years_experience);
    if (!Number.isFinite(years) || years < 0) return err('VALIDATION', 'years_experience must be a non-negative number.');
    const categories = Array.isArray(body.experience_categories)
      ? body.experience_categories.map((c: unknown) => String(c))
      : [];

    const sb = supabaseAdmin();
    const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityErr) return err('ENTITY_FAILED', entityErr.message);

    const { data, error } = await sb
      .from('cap_qualified_individuals')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId,
        stakeholder_id: body.stakeholder_id ?? null,
        party_id: body.party_id ?? null,
        full_name: fullName,
        firm: body.firm ? String(body.firm) : null,
        is_independent: Boolean(body.is_independent),
        qualifications_summary: summary,
        years_experience: years,
        experience_categories: categories,
        cv_document_id: body.cv_document_id ?? null,
        board_approval_id: body.board_approval_id ?? null,
        determined_on: body.determined_on ?? null,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to record qualified individual.';
    return err('CREATE_FAILED', message);
  }
}
