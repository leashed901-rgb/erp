import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/returns/[id]/refund — refund a return (doc 17: refunds post
 * through `erp_refund_order`). Body: { amount, reason }. The RPC caps the
 * refund at what was paid on the order and writes `erp_return_refunds`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const amount = Number(body.amount);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount must be a positive number', 400);
  if (!reason) return err('VALIDATION', 'A refund reason is required', 400);
  const { data: rma } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .select('order_id')
    .eq('id', id)
    .maybeSingle();
  if (!rma) return err('NOT_FOUND', 'Return not found', 404);
  const { data: totalRefunded, error } = await supabaseAdmin().rpc('erp_refund_order', {
    p_order_id: rma.order_id,
    p_amount: amount,
    p_reason: reason,
    p_rma_id: id,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: refunds } = await supabaseAdmin()
    .from('erp_return_refunds')
    .select('*')
    .eq('rma_id', id)
    .order('created_at', { ascending: false });
  return NextResponse.json({ data: { total_refunded: totalRefunded, refunds: refunds ?? [] } });
}
