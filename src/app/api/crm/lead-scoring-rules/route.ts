import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/lead-scoring-rules — list scoring rules for the tenant. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true });
  if (error) {
    // Schema may not be applied — surface a clear signal so the UI can adapt.
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/lead-scoring-rules — create a scoring rule.
 *  Body: { field, operator, value, points, is_active?, label? }
 *  Fields: has_email, has_phone, inbound, engaged_7d, stale, source_equals, etc.
 *  Operators: eq, ne, gt, lt, exists, not_exists, contains
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.field || !body.operator) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'field and operator are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name || body.label || `${body.field}_${body.operator}`),
    field: String(body.field),
    operator: String(body.operator),
    value: body.value == null ? null : String(body.value),
    points: Number(body.points) || 0,
    is_active: body.is_active !== false,
  };
  if (body.label) insert.label = String(body.label);
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_scoring_rules')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
