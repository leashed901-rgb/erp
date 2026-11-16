import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/gateway-clearing-entries — the gateway clearing
 * register (Batch I, read-only). One row per gateway settlement
 * batch: gross / fee / reserve / net and its state. Written by the
 * payment gateway flow, never by hand.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_gateway_clearing_entries').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id,
      gateway: e.gateway,
      grossAmount: Number(e.gross_amount || 0),
      feeAmount: Number(e.fee_amount || 0),
      reserveAmount: Number(e.reserve_amount || 0),
      netAmount: Number(e.net_amount || 0),
      state: e.state,
    })),
  });
}
