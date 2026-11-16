import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxRule } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/rules — tax rate rules (acct_tax_rules). `rate` is a fraction (0.07 = 7%). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_tax_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('jurisdiction', { ascending: true })
    .order('tax_type', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: TaxRule[] = (data || []).map((r) => ({
    id: r.id,
    jurisdiction: r.jurisdiction,
    taxType: r.tax_type,
    stateCode: r.state_code,
    rate: Number(r.rate) || 0,
    taxCode: r.tax_code,
    classification: r.classification,
    autoCalc: Boolean(r.auto_calc),
    isActive: r.is_active !== false,
  }));
  return NextResponse.json({ data: dtos });
}

/** POST /api/tax/rules — create a tax rate rule. Body: { jurisdiction, taxType, rate (fraction), stateCode?, taxCode?, classification?, autoCalc? }. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.jurisdiction) return err('VALIDATION', 'jurisdiction is required', 400);
  if (!body.taxType) return err('VALIDATION', 'taxType is required', 400);
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return err('VALIDATION', 'rate must be a fraction between 0 and 1', 400);
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    jurisdiction: String(body.jurisdiction),
    tax_type: String(body.taxType),
    rate,
    auto_calc: body.autoCalc === true,
    is_active: true,
  };
  // state_code / classification / tax_code: NOT NULL columns with DB
  // defaults — omit the key when not given (an explicit null 500s).
  if (body.stateCode) insert.state_code = String(body.stateCode);
  if (body.taxCode) insert.tax_code = String(body.taxCode);
  if (body.classification) insert.classification = String(body.classification);
  const { data, error } = await supabaseAdmin().from('acct_tax_rules').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
