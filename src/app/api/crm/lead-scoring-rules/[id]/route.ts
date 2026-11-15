import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/crm/lead-scoring-rules/[id] — update a rule (points, active, etc.). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['field', 'operator', 'value', 'points', 'is_active', 'label']) {
    if (f in body) updates[f] = body[f];
  }
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Rule not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data });
}

/** DELETE /api/crm/lead-scoring-rules/[id] — remove a rule. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
