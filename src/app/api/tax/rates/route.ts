import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/tax/rates — sales tax rates.
 *
 *  Deviation from pages-5 (which names acct_tax_rates as the Rates
 *  backing table): the engine never reads acct_tax_rates — the
 *  canonical rate store is acct_tax_codes (decision D-6, see
 *  /api/v1/tax/rates). This route reads the codes and shapes them as
 *  rates so the Rates page shows the rates that actually apply to
 *  sales (TN 7%, TX 6.25%). acct_tax_rates stays untouched (0 rows).
 *
 *  Row: { id, code, name, jurisdiction, jurisdiction_id, rate,
 *  rate_percent, gl_account_id, is_active } — rate is the stored
 *  fraction (0.07), rate_percent the display percent (7). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: codes, error } = await sb
    .from('acct_tax_codes')
    .select('id, code, name, jurisdiction_id, rate, payable_account_id, is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name');
  if (error) return err('LIST_FAILED', error.message, 500);
  const jids = [...new Set((codes || []).map((c) => c.jurisdiction_id).filter(Boolean))];
  let jurNames: Record<string, string> = {};
  if (jids.length) {
    const { data: jurs } = await sb.from('acct_tax_jurisdictions').select('id, code, name').in('id', jids);
    for (const j of jurs || []) jurNames[j.id] = j.name || j.code;
  }
  const rows = (codes || []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    jurisdiction: c.jurisdiction_id ? (jurNames[c.jurisdiction_id] || null) : null,
    jurisdiction_id: c.jurisdiction_id,
    rate: Number(c.rate) || 0,
    rate_percent: Math.round((Number(c.rate) || 0) * 10000) / 100,
    gl_account_id: c.payable_account_id,
    is_active: c.is_active,
  }));
  return NextResponse.json({ data: rows, meta: { total: rows.length } });
}

/** POST /api/tax/rates — create a sales tax rate (an acct_tax_codes
 *  row). Body: { name, jurisdiction, rate_percent, gl_account_id?,
 *  is_active? } — jurisdiction is a label ("TN", "Tennessee") resolved
 *  to the jurisdiction row; rate_percent is 0–100 and is stored as
 *  the fraction rate_percent/100. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return err('VALIDATION', 'name is required.');
    const rate = Number(body.rate_percent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return err('VALIDATION', 'rate_percent must be between 0 and 100.');
    }
    const sb = supabaseAdmin();
    let jurisdictionId: string | null = body.jurisdiction_id ? String(body.jurisdiction_id) : null;
    if (!jurisdictionId && body.jurisdiction != null) {
      const label = String(body.jurisdiction).trim();
      if (label) {
        const { data: byCode } = await sb.from('acct_tax_jurisdictions')
          .select('id').eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('code', label.toUpperCase()).maybeSingle();
        if (byCode?.id) {
          jurisdictionId = byCode.id;
        } else {
          const { data: byName } = await sb.from('acct_tax_jurisdictions')
            .select('id').eq('tenant_id', DEFAULT_TENANT_ID)
            .ilike('name', label).maybeSingle();
          jurisdictionId = byName?.id ?? null;
        }
      }
    }
    // acct_tax_codes.jurisdiction_id is NOT NULL — an unresolvable
    // label is a 400 (the caller named a jurisdiction that does not
    // exist), not a 500 from the insert.
    if (!jurisdictionId) {
      const label = body.jurisdiction != null ? String(body.jurisdiction).trim() : '';
      return err('VALIDATION', label
        ? `Unknown jurisdiction: ${label}. Use a jurisdiction id or a known code/name.`
        : 'jurisdiction is required.');
    }
    const { data, error } = await sb
      .from('acct_tax_codes')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        jurisdiction_id: jurisdictionId,
        code: body.code ? String(body.code) : `TAX-${Date.now()}`,
        name,
        tax_type: 'sales',
        rate: rate / 100,
        recoverable_percent: 0,
        payable_account_id: body.gl_account_id ? String(body.gl_account_id) : null,
        receivable_account_id: null,
        effective_from: new Date().toISOString().slice(0, 10),
        is_compound: false,
        is_active: body.is_active !== false,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data: {
      id: data.id,
      code: data.code,
      name: data.name,
      jurisdiction: body.jurisdiction != null ? String(body.jurisdiction) : null,
      jurisdiction_id: data.jurisdiction_id,
      rate: Number(data.rate) || 0,
      rate_percent: rate,
      gl_account_id: data.payable_account_id,
      is_active: data.is_active,
    } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create tax rate.';
    return err('CREATE_FAILED', message);
  }
}
