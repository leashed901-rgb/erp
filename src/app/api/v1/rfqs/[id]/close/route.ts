import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/rfqs/:id/close — ds_close_rfq. Closing reveals sealed bids.
 * The RPC explicitly allows a null uid (cron/service), so it is called
 * directly. Only a published RFQ can close; draft bids are withdrawn.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: rfq, error: ownError } = await supabaseAdmin()
      .from('rfqs')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (ownError || !rfq) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RFQ not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data, error } = await supabaseAdmin().rpc('ds_close_rfq', { p_rfq: id });
    if (error) throw new Error(`ds_close_rfq: ${error.message}`);
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to close RFQ.');
  }
}
