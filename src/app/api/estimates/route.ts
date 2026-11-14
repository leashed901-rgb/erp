import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/estimates?customer_id=xxx
 *  Reads from acct_estimates (the real accounting table where DocumentEngine
 *  creates estimates). The `estimates` table is a legacy mirror — acct_estimates
 *  is the source of truth. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin()
    .from('acct_estimates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  // Normalize the response: map acct_estimates columns to the EstimateRow shape
  // the UI expects (number ← estimate_number, issue_date ← estimate_date).
  const rows = (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    number: r.estimate_number || r.number,
    issue_date: r.estimate_date || r.issue_date,
  }));
  return NextResponse.json({ data: rows });
}

/** POST /api/estimates */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    number: body.number || `EST-${Date.now()}`,
    customer_id: body.customer_id,
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    expiry_date: body.expiry_date || null,
    status: body.status || 'draft',
    currency: body.currency || 'USD',
    subtotal: Number(body.subtotal) || 0,
    tax_total: Number(body.tax_total) || 0,
    total: Number(body.total) || 0,
    notes: body.notes || null,
    terms: body.terms || null,
  };
  const { data, error } = await supabaseAdmin().from('estimates').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
