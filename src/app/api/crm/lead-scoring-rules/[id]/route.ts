import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/crm/lead-scoring-rules/[id] — update a scoring rule. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  // The operator set is the schema CHECK on crm_lead_scoring_rules.
  const OPERATORS = ['eq', 'neq', 'contains', 'gt', 'lt', 'is_set', 'is_not_set'];
  if ('operator' in body && !OPERATORS.includes(String(body.operator))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `operator must be one of: ${OPERATORS.join(', ')}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {};
  for (const f of ['name', 'field', 'operator', 'value', 'points', 'is_active']) {
    if (f in body) updates[f] = f === 'points' ? Number(body[f]) : body[f];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'No updatable fields supplied', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error?.message || 'Scoring rule not found', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

/** DELETE /api/crm/lead-scoring-rules/[id] — remove a scoring rule. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
