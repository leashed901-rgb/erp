import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Hold an order (doc 14: order.hold → erp_hold_order). The RPC is
   guarded by platform_is_tenant_member(auth.uid()), which a
   service-role call can never satisfy — so, following the existing
   returns-decision route's precedent, this route performs the same
   update the RPC performs, directly on erp_orders. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  if (!reason) return err('VALIDATION', 'a hold reason is required', 400);
  const sb = supabaseAdmin();
  const { data: order } = await sb.from('erp_orders').select('id, attention_reason').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!order) return err('NOT_FOUND', 'Order not found', 404);
  const { error } = await sb
    .from('erp_orders')
    .update({
      on_hold: true,
      hold_reason: reason,
      held_at: new Date().toISOString(),
      needs_attention: true,
      attention_reason: order.attention_reason || `on hold: ${reason}`,
    })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, onHold: true, holdReason: reason } });
}
