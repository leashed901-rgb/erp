import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * POST /api/sellers/violations — record a violation against a seller
 * (the profile's "Record violation" action). GET lists violations,
 * optionally filtered by ?seller_id=.
 */
export async function GET(req: NextRequest) {
  const sellerId = req.nextUrl.searchParams.get('seller_id');
  let query = supabaseAdmin()
    .from('seller_violations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (sellerId) query = query.eq('seller_id', sellerId);
  const { data, error } = await query;
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('VALIDATION', 'JSON body required', 400);
  if (!body.seller_id || !body.violation_type) {
    return fail('VALIDATION', 'seller_id and violation_type are required', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('seller_violations')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: String(body.seller_id),
      violation_type: String(body.violation_type),
      severity: typeof body.severity === 'string' ? body.severity : 'medium',
      status: 'open',
      description: typeof body.description === 'string' ? body.description : null,
      listing_id: typeof body.listing_id === 'string' ? body.listing_id : null,
      order_id: typeof body.order_id === 'string' ? body.order_id : null,
    })
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
