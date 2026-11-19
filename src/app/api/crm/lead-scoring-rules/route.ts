import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/lead-scoring-rules — the lead scoring rules (doc 03),
 * biggest point values first. Active rules are applied by the
 * crm_score_lead RPC whenever a lead is (re)scored.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('points', { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * POST /api/crm/lead-scoring-rules — create a scoring rule
 * (registered action `create.lead_scoring_rule`, admin).
 * Required: name, field, operator, points. value is optional
 * (existence checks like has_email carry no comparison value).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  for (const f of ['name', 'field', 'operator']) {
    if (!body[f]) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `${f} is required`, requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
  }
  // The operator set is the schema CHECK on crm_lead_scoring_rules —
  // validate here so a bad rule is a 400, not a constraint 500.
  const OPERATORS = ['eq', 'neq', 'contains', 'gt', 'lt', 'is_set', 'is_not_set'];
  if (!OPERATORS.includes(String(body.operator))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `operator must be one of: ${OPERATORS.join(', ')}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (body.points == null || Number.isNaN(Number(body.points))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'points is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    field: String(body.field),
    operator: String(body.operator),
    value: body.value != null ? String(body.value) : null,
    points: Number(body.points),
    is_active: body.is_active !== false,
  };
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data }, { status: 201 });
}
