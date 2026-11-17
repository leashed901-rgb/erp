import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/orders/[id]/refund — registry fulfillment.refund →
 *  erp_refund_order RPC (doc 14 gap route). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount (positive) is required', 400);
  const { data, error } = await supabaseAdmin().rpc('erp_refund_order', {
    p_order_id: id,
    p_amount: amount,
    p_reason: body.reason ? String(body.reason) : null,
    p_rma_id: body.rmaId ? String(body.rmaId) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
