import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/returns — list return authorizations. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('erp_return_authorizations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') query = query.eq('status', status);
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/v1/returns — create a return authorization. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    order_id: body.order_id || null,
    customer_id: body.customer_id || null,
    rma_number: body.rma_number || `RMA-${Date.now()}`,
    status: 'requested',
    reason: body.reason || null,
    resolution: body.resolution || 'refund',
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('erp_return_authorizations').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
