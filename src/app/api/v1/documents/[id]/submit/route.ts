import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/submit?type=Bill
 *  Submits a bill for approval → RPC `acct_submit_bill`.
 *  When no active approval workflow matches the bill, it is
 *  auto-approved (approval_status 'not_required', status 'approved').
 *  When a workflow matches, pending approval rows are created and the
 *  bill moves to 'pending_approval' — approve it with the approve
 *  route. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (type !== 'Bill' && type !== 'bill') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'submit applies to Bill documents', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const { data, error } = await supabaseAdmin().rpc('acct_submit_bill', {
    p_bill_id: id,
    p_stage: (body.stage as string) || 'bill',
  });
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  const { data: bill } = await supabaseAdmin()
    .from('acct_ap_bills')
    .select('id, bill_number, status, approval_status, open_balance')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return NextResponse.json({
    data: bill || { id },
    message:
      data === 'pending'
        ? 'Bill submitted for approval'
        : 'Bill approved — no approval workflow applies',
  });
}
