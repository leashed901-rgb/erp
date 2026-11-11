import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/dependents?customer_id=xxx — list dependents for a customer (or all). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const leadId = searchParams.get('lead_id');
  let query = supabaseAdmin()
    .from('dependents')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (customerId) query = query.eq('customer_id', customerId);
  if (leadId) query = query.eq('lead_id', leadId);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/dependents — create a dependents row. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const insert = { ...body, tenant_id: DEFAULT_TENANT_ID };
  const { data, error } = await supabaseAdmin()
    .from('dependents')
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
