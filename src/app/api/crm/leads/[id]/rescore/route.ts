import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/crm/leads/[id]/rescore
 *  Wraps the crm_score_lead RPC. Recalculates the lead score from the
 *  scoring rules + activity. Falls back to a deterministic heuristic
 *  (activity count + source weight) if the RPC isn't installed. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Try the RPC first.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('crm_score_lead', {
    lead_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
  });
  if (!rpcErr && rpcData != null) {
    const score = typeof rpcData === 'number' ? rpcData : (rpcData as { score?: number }).score ?? 0;
    return NextResponse.json({ data: { score, source: 'rpc' } });
  }

  // 2. Manual fallback: count activities + weight the lead source.
  const { count: activityCount } = await supabaseAdmin()
    .from('crm_lead_activities')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const { data: lead } = await supabaseAdmin()
    .from('crm_leads')
    .select('lead_source, status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();

  const sourceWeight: Record<string, number> = {
    referral: 30, website: 20, google: 25, campaign: 15, social_media: 10, manual: 5,
  };
  const source = (lead?.lead_source as string) || 'manual';
  const base = sourceWeight[source] ?? 5;
  const acts = activityCount || 0;
  const score = Math.min(100, base + Math.min(50, acts * 5));

  // Persist the score on the lead (best-effort — column may not exist).
  await supabaseAdmin()
    .from('crm_leads')
    .update({ lead_score: score, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({ data: { score, source: 'heuristic' } });
}
