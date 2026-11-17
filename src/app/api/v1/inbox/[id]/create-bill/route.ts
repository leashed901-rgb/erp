import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** POST /api/v1/inbox/[id]/create-bill — creates a draft bill from the
 *  inbox row via the sanctioned acct_inbox_create_bill RPC (it builds the
 *  bill + lines, links the attachment, marks the inbox row processed).
 *  Body: { vendor_id?, bill_number?, bill_date?, due_date?, memo? }.
 *  The RPC requires a vendor — 400 honestly when the row has none and
 *  the caller supplies none. Idempotent: returns the existing bill when
 *  the row already has one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const overrides: Record<string, unknown> = {};
  for (const f of ['vendor_id', 'bill_number', 'bill_date', 'due_date', 'memo']) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== '') overrides[f] = body[f];
  }
  const { data, error } = await supabaseAdmin().rpc('acct_inbox_create_bill', {
    p_inbox_id: id,
    p_overrides: overrides,
    p_post: false,
  });
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const billId = data as string;
  const { data: bill } = await supabaseAdmin()
    .from('acct_ap_bills')
    .select('id, bill_number, total, status')
    .eq('id', billId)
    .single();
  return NextResponse.json({ data: bill || { id: billId } }, { status: 201 });
}
