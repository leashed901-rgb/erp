import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/rfqs/:id/compare — bid ranking, cheapest first. Same shape
 * as ds_compare_bids (bid fields + line_count, ordered by total_amount).
 * The RPC's membership assert blocks service-role calls, so the route
 * reads directly. While the RFQ is sealed and not closed/awarded the
 * amounts stay hidden — the route refuses with 409.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: rfq, error: ownError } = await supabaseAdmin()
      .from('rfqs')
      .select('id,status,sealed')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (ownError || !rfq) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RFQ not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (rfq.sealed && !['closed', 'awarded'].includes(rfq.status as string)) {
      return NextResponse.json(
        {
          error: {
            code: 'SEALED',
            message: 'Bids are sealed until the RFQ closes.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 409 },
      );
    }
    const { data: bids, error } = await supabaseAdmin()
      .from('bids')
      .select(
        'id,vendor_id,revision,status,currency,total_amount,lead_time_days,payment_terms,incoterm,valid_until,submitted_at',
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('rfq_id', id)
      .order('total_amount', { ascending: true, nullsFirst: false });
    if (error) throw new Error(`compare bids: ${error.message}`);
    const comparison = [];
    for (const b of bids ?? []) {
      const { count } = await supabaseAdmin()
        .from('bid_lines')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('bid_id', b.id as string);
      comparison.push({ ...b, line_count: count ?? 0 });
    }
    return NextResponse.json({ comparison });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to compare bids.');
  }
}
