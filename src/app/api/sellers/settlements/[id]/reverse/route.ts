import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSellerSettlement, toSellerSettlementReversal } from '@/lib/sellerTypes';

/* Reverse a settlement (doc 21: seller_settlements + reversals).
   Writes a seller_settlement_reversals row and moves the settlement
   to 'reversed' (full) or 'partially_reversed' (amount < net). The
   reversal row requires the Stripe refund reference, per the schema. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const REVERSAL_STATES = ['recorded', 'transfer_reversed', 'no_transfer'];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stripeRefundId = typeof body.stripeRefundId === 'string' && body.stripeRefundId.trim() ? body.stripeRefundId.trim() : null;
  if (!stripeRefundId) return err('VALIDATION', 'stripeRefundId is required — a reversal records the Stripe refund it belongs to', 400);
  const sb = supabaseAdmin();
  const { data: settlement } = await sb
    .from('seller_settlements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!settlement) return err('NOT_FOUND', 'Settlement not found', 404);
  if (settlement.state === 'reversed') return err('CONFLICT', 'Settlement is already fully reversed', 409);

  const netCents = Number(settlement.net_cents) || 0;
  const amountCents = typeof body.amount === 'number' ? Math.round(body.amount * 100) : netCents;
  if (amountCents <= 0 || amountCents > netCents) {
    return err('VALIDATION', `amount must be between 0 and the settlement net (${netCents / 100})`, 400);
  }
  const commissionReversedCents = typeof body.commissionReversed === 'number' ? Math.round(body.commissionReversed * 100) : 0;
  const state = typeof body.state === 'string' && REVERSAL_STATES.includes(body.state)
    ? body.state
    : (settlement.stripe_transfer_id ? 'transfer_reversed' : 'recorded');

  const { data: reversal, error } = await sb
    .from('seller_settlement_reversals')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      settlement_id: id,
      order_id: settlement.order_id as string,
      seller_id: settlement.seller_id as string,
      stripe_refund_id: stripeRefundId,
      stripe_reversal_id: typeof body.stripeReversalId === 'string' ? body.stripeReversalId : null,
      amount_cents: amountCents,
      commission_reversed_cents: commissionReversedCents,
      net_reversed_cents: amountCents - commissionReversedCents,
      state,
      idempotency_key: `reversal:${id}:${stripeRefundId}`,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);

  const { data: prior } = await sb
    .from('seller_settlement_reversals')
    .select('amount_cents')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('settlement_id', id);
  const reversedTotal = (prior || []).reduce((s, r) => s + (Number(r.amount_cents) || 0), 0);
  const { data: updated, error: upErr } = await sb
    .from('seller_settlements')
    .update({ state: reversedTotal >= netCents ? 'reversed' : 'partially_reversed' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (upErr) return err('INTERNAL', upErr.message, 500);
  return NextResponse.json({
    data: {
      settlement: toSellerSettlement(updated as Record<string, unknown>),
      reversal: toSellerSettlementReversal(reversal as Record<string, unknown>),
    },
  }, { status: 201 });
}
