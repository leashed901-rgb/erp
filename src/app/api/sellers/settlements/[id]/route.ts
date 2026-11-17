import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSellerSettlement, toSellerSettlementReversal } from '@/lib/sellerTypes';

/* Settlement detail (doc 21): the settlement plus its reversals. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('seller_settlements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Settlement not found', 404);
  const { data: reversals } = await sb
    .from('seller_settlement_reversals')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('settlement_id', id)
    .order('created_at', { ascending: false });
  return NextResponse.json({
    data: {
      settlement: toSellerSettlement(data as Record<string, unknown>),
      reversals: (reversals || []).map((r) => toSellerSettlementReversal(r as Record<string, unknown>)),
    },
  });
}
