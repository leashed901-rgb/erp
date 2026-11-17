import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxabilityRule } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/taxability-rules — taxability rules (acct_tax_taxability_rules). rateOverride is a fraction. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_tax_taxability_rules')
    .select('*, acct_tax_jurisdictions(name)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: TaxabilityRule[] = (data || []).map((r) => ({
    id: r.id,
    jurisdictionId: r.jurisdiction_id,
    jurisdictionName: (r.acct_tax_jurisdictions as { name?: string } | null)?.name || null,
    taxCategory: r.tax_category,
    treatment: r.treatment,
    rateOverride: r.rate_override == null ? null : Number(r.rate_override),
    minUnitPrice: r.min_unit_price == null ? null : Number(r.min_unit_price),
    maxUnitPrice: r.max_unit_price == null ? null : Number(r.max_unit_price),
    appliesToChildren: Boolean(r.applies_to_children),
    direction: r.direction,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    priority: Number(r.priority) || 0,
    name: r.name,
    legalReference: r.legal_reference,
    isActive: r.is_active !== false,
  }));
  return NextResponse.json({ data: dtos });
}

/** POST /api/tax/taxability-rules — create a taxability rule. Body: { jurisdictionId (required — the column is NOT NULL), taxCategory, treatment, rateOverride (fraction)?, priority?, name? }. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.taxCategory) return err('VALIDATION', 'taxCategory is required', 400);
  if (!body.treatment) return err('VALIDATION', 'treatment is required', 400);
  if (!body.jurisdictionId) return err('VALIDATION', 'jurisdictionId is required', 400);
  // effective_from + name are NOT NULL with no DB default — required.
  if (!body.effectiveFrom) return err('VALIDATION', 'effectiveFrom is required', 400);
  if (!body.name) return err('VALIDATION', 'name is required', 400);
  let rateOverride: number | null = null;
  if (body.rateOverride !== undefined && body.rateOverride !== null && body.rateOverride !== '') {
    rateOverride = Number(body.rateOverride);
    if (!Number.isFinite(rateOverride) || rateOverride < 0 || rateOverride > 1) {
      return err('VALIDATION', 'rateOverride must be a fraction between 0 and 1', 400);
    }
  }
  const sb = supabaseAdmin();
  if (body.jurisdictionId) {
    const { data: j, error: jErr } = await sb
      .from('acct_tax_jurisdictions')
      .select('id')
      .eq('id', String(body.jurisdictionId))
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .maybeSingle();
    if (jErr || !j) return err('VALIDATION', 'jurisdictionId not found for this tenant', 400);
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    jurisdiction_id: String(body.jurisdictionId),
    tax_category: String(body.taxCategory),
    treatment: String(body.treatment),
    rate_override: rateOverride,
    applies_to_children: body.appliesToChildren === true,
    // direction defaults to 'sale' in the DB; send it explicitly.
    direction: body.direction ? String(body.direction) : 'sale',
    effective_from: String(body.effectiveFrom),
    priority: body.priority !== undefined && body.priority !== null ? Number(body.priority) : 100,
    name: String(body.name),
    is_active: true,
  };
  // Nullable columns: omit the key when not given (explicit null is fine
  // here, but omitting keeps the insert honest).
  if (body.minUnitPrice !== undefined && body.minUnitPrice !== null && body.minUnitPrice !== '') insert.min_unit_price = Number(body.minUnitPrice);
  if (body.maxUnitPrice !== undefined && body.maxUnitPrice !== null && body.maxUnitPrice !== '') insert.max_unit_price = Number(body.maxUnitPrice);
  if (body.effectiveTo) insert.effective_to = String(body.effectiveTo);
  if (body.legalReference) insert.legal_reference = String(body.legalReference);
  const { data, error } = await sb.from('acct_tax_taxability_rules').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
