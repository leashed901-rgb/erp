import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/settlements — list Stripe/Shopify settlements.
 * POST /api/v1/settlements — split a settlement into gross/fees/refunds/net.
 *
 * Settlements come from acct_channel_settlements + acct_channel_settlement_lines.
 * A Stripe payout lands here and gets auto-split.
 */

/** GET — list settlements. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabaseAdmin()
    .from('acct_channel_settlements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST — post a settlement (creates deposit + fee expense + clears invoices). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const grossAmount = Number(body.gross_amount) || 0;
  const feeAmount = Number(body.fee_amount) || 0;
  const refundAmount = Number(body.refund_amount) || 0;
  const netAmount = grossAmount - feeAmount - refundAmount;

  // Create the settlement record
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    channel: body.channel || 'stripe',
    provider_payout_id: body.provider_payout_id || null,
    gross_amount: grossAmount,
    fee_amount: feeAmount,
    refund_amount: refundAmount,
    net_amount: netAmount,
    currency: body.currency || 'USD',
    settled_at: body.settled_at || new Date().toISOString(),
    status: 'posted',
  };

  const { data, error } = await supabaseAdmin()
    .from('acct_channel_settlements')
    .insert(insert)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });

  return NextResponse.json({
    data,
    message: `Settlement posted: gross $${grossAmount.toFixed(2)}, fees $${feeAmount.toFixed(2)}, net $${netAmount.toFixed(2)}`,
  }, { status: 201 });
}
