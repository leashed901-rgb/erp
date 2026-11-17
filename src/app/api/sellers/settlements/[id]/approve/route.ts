import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSellerSettlement } from '@/lib/sellerTypes';

/* Approve a settlement (doc 21 settlements workspace): a pending
   settlement is executed — state 'settled', executed_at stamped.
   The Stripe transfer itself is created by the payout worker; this
   is the operator approval that releases it. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('seller_settlements')
    .select('id, state')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Settlement not found', 404);
  if (current.state !== 'pending') return err('CONFLICT', `Settlement is ${current.state as string} — only a pending settlement can be approved`, 409);
  const { data, error } = await sb
    .from('seller_settlements')
    .update({ state: 'settled', executed_at: new Date().toISOString(), pending_reason: null })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSellerSettlement(data as Record<string, unknown>) });
}
