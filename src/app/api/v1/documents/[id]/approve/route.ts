import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/approve?type=Bill — wraps acct_decide_bill RPC.
 *  Approves a For-Review bill → flips status to Unpaid (open).
 *  Body: { decision?: 'approve' | 'reject', reason? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body ok */ }
  const decision = (body.decision as string | undefined) || 'approve';

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_decide_bill', {
    bill_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
    decision,
    reason: (body.reason as string | undefined) || null,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { approved: true, source: 'rpc' } });
  }

  // 2. Fallback: flip the bill status. For-Review (review) → open (Unpaid).
  //    acct_ap_bills is the real table; `bills` is a legacy mirror.
  const newStatus = decision === 'reject' ? 'rejected' : 'open';
  const { data: updated, error: updErr } = await supabaseAdmin()
    .from('acct_ap_bills')
    .update({
      status: newStatus,
      approval_status: decision,
      approved_at: decision === 'approve' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, status, approval_status')
    .single();
  if (updErr) {
    // approval_status column may not exist — try with just status.
    const { data: u2, error: e2 } = await supabaseAdmin()
      .from('acct_ap_bills')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .select('id, status')
      .single();
    if (e2) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: e2.message } }, { status: 500 });
    }
    return NextResponse.json({ data: { approved: true, bill: u2, source: 'fallback' } });
  }
  return NextResponse.json({ data: { approved: true, bill: updated, source: 'fallback' } });
}
