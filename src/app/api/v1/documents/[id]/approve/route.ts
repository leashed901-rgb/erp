import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/approve?type=Bill
 *  Registry action `bill.approve` → RPC `acct_decide_bill`.
 *  Approves a bill out of review and into Unpaid.
 *  Body: { comments?, stage? } — stage defaults to 'bill'.
 *  Query ?approve=0 declines instead of approving.
 *
 *  When nothing is waiting for approval AND no approval workflow
 *  governs the bill (approval_status 'not_required'), the bill is
 *  submitted first (acct_submit_bill auto-approves when no workflow
 *  matches) so one click in BillsScreen approves a draft bill. When
 *  a workflow IS pending, an RPC rejection (segregation of duties,
 *  wrong approver) is returned as-is — the fallback never approves
 *  around a workflow. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (type !== 'Bill' && type !== 'bill') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'approve applies to Bill documents', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const approve = searchParams.get('approve') !== '0' && body.approve !== false;

  const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_decide_bill', {
    p_bill_id: id,
    p_approve: approve,
    p_comments: (body.comments as string) || null,
    p_stage: (body.stage as string) || 'bill',
  });
  if (!rpcError) {
    return NextResponse.json({ data: { id, decision: rpcResult }, message: approve ? 'Bill approved and moved to Unpaid' : 'Bill declined' });
  }

  // "Nothing waiting for approval" + no pending approval row exists
  // for this bill: submit it. With no workflow configured that
  // auto-approves; with a workflow it creates the pending steps and
  // the bill genuinely awaits an approver. (Bills are created with
  // approval_status 'pending' but no approval rows, so checking the
  // status value alone would never fire this path.)
  if (rpcError.message.includes('Nothing waiting for approval')) {
    const { data: pending } = await supabaseAdmin()
      .from('acct_ap_approvals')
      .select('id')
      .eq('bill_id', id)
      .eq('stage', (body.stage as string) || 'bill')
      .eq('status', 'pending')
      .limit(1);
    if (!pending || pending.length === 0) {
      const { data: submitResult, error: submitErr } = await supabaseAdmin().rpc('acct_submit_bill', {
        p_bill_id: id,
        p_stage: (body.stage as string) || 'bill',
      });
      if (!submitErr) {
        return NextResponse.json({
          data: { id, decision: submitResult },
          message:
            submitResult === 'pending'
              ? 'Bill submitted for approval — awaiting approver'
              : approve
                ? 'Bill approved and moved to Unpaid'
                : 'Bill declined',
        });
      }
      return NextResponse.json({ error: { code: 'INTERNAL', message: submitErr.message, requestId: crypto.randomUUID() } }, { status: 500 });
    }
  }

  return NextResponse.json({ error: { code: 'INTERNAL', message: rpcError.message, requestId: crypto.randomUUID() } }, { status: 500 });
}
