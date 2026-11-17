import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/orders/[id]/cancel — registry fulfillment.cancel_order →
 *  erp_cancel_order RPC (doc 14 gap route). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* reason optional */ }
  const { data, error } = await supabaseAdmin().rpc('erp_cancel_order', {
    p_order_id: id,
    p_reason: body.reason ? String(body.reason) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
