import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSellerSettlement } from '@/lib/sellerTypes';

/* Seller settlements (doc 21: Marketplace/Settlements →
   seller_settlements). The workspace actions are approve (settle),
   hold and reverse — see settlements/[id]/*. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  let query = supabaseAdmin()
    .from('seller_settlements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (params.get('sellerId')) query = query.eq('seller_id', params.get('sellerId') as string);
  if (params.get('state')) query = query.eq('state', params.get('state') as string);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toSellerSettlement(r as Record<string, unknown>)) });
}
