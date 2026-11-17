import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/deals/[id]/stage-history — the deal's stage timeline
 * (crm_deal_stage_history, written by crm_move_deal), newest first.
 * This is the data source for the deal drawer's stage-history timeline.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('crm_deal_stage_history')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('deal_id', id)
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}
