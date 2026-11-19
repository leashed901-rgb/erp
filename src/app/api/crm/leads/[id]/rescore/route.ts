import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/crm/leads/[id]/rescore — recalculate a lead's score
 * (registered action `lead.rescore`). Delegates to the crm_score_lead
 * RPC, which applies the tenant's active crm_lead_scoring_rules and
 * returns the new score.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().rpc('crm_score_lead', { p_lead: id });
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { lead_id: id, score: data } });
}
