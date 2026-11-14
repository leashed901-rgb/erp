import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/bank-rules — priority-ordered bank rules. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: true });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/bank-rules — create a bank rule.
 *  Body: { name, condition_field, condition_op, condition_value, action, action_value?, priority?, is_active? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name || !body.condition_field || !body.action) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'name, condition_field, action are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    condition_field: String(body.condition_field),
    condition_op: String(body.condition_op || 'contains'),
    condition_value: String(body.condition_value || ''),
    action: String(body.action),
    action_value: body.action_value ? String(body.action_value) : null,
    priority: Number(body.priority) || 100,
    is_active: body.is_active !== false,
  };
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_rules')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
