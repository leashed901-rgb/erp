import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Release a held order (doc 14: order.release → erp_release_order).
   Same membership-guard situation as hold: the route performs the
   RPC's update directly on erp_orders (returns-decision precedent). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const { data: order } = await sb.from('erp_orders').select('id, attention_reason').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!order) return err('NOT_FOUND', 'Order not found', 404);
  const clearAttention = typeof order.attention_reason === 'string' && order.attention_reason.startsWith('on hold:');
  const { error } = await sb
    .from('erp_orders')
    .update({
      on_hold: false,
      hold_reason: null,
      held_at: null,
      held_by: null,
      ...(clearAttention ? { needs_attention: false, attention_reason: null } : {}),
    })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, onHold: false } });
}
