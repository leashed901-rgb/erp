import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdEvent } from '@/lib/adDto';

/* Pixel events (doc 22 nav: Advertising/Pixels → ad_events): the
   recent event stream plus per-type counts. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ad_events')
    .select('*')
    .order('event_time', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data || []) as Record<string, unknown>[];
  const counts: Record<string, number> = {};
  rows.forEach((r) => { const t = String(r.event_type || ''); counts[t] = (counts[t] || 0) + 1; });
  return NextResponse.json({ data: { events: rows.map(toAdEvent), counts } });
}

const TYPES = new Set(['impression', 'click', 'conversion']);

/* POST /api/advertising/events — pixel event ingest (module 6).
 * The storefront pixel (or any producer) posts one event per call:
 *   { type: 'impression'|'click'|'conversion', campaignId, creativeId?,
 *     placementKey?, requestId? }
 * Writes go through increment_ad_event (counters + daily roll up in
 * the same call). Replays count once: when requestId is supplied and
 * was already recorded, the RPC returns FALSE and nothing is written
 * — the response is 200 { deduped: true }. Without a requestId there
 * is nothing to dedupe on and every call counts.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const type = typeof body.type === 'string' ? body.type : '';
  if (!TYPES.has(type)) {
    return err('VALIDATION', "type must be 'impression', 'click' or 'conversion'", 400);
  }
  const campaignId = body.campaignId != null ? Number(body.campaignId) : NaN;
  if (!Number.isInteger(campaignId)) {
    return err('VALIDATION', 'campaignId is required', 400);
  }
  const creativeId = body.creativeId != null && body.creativeId !== ''
    ? Number(body.creativeId) : null;
  if (creativeId !== null && !Number.isInteger(creativeId)) {
    return err('VALIDATION', 'creativeId must be an integer', 400);
  }
  const placementKey = typeof body.placementKey === 'string' && body.placementKey
    ? body.placementKey : null;
  const requestId = typeof body.requestId === 'string' && body.requestId
    ? body.requestId : null;
  if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return err('VALIDATION', 'requestId must be a UUID', 400);
  }

  const sb = supabaseAdmin();
  const { data: campaign } = await sb.from('ad_campaigns').select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID).eq('id', campaignId).maybeSingle();
  if (!campaign) return err('NOT_FOUND', 'Campaign not found', 404);
  if (creativeId !== null) {
    const { data: creative } = await sb.from('ad_creatives').select('id')
      .eq('id', creativeId).eq('campaign_id', campaignId).maybeSingle();
    if (!creative) return err('NOT_FOUND', 'Creative not found on this campaign', 404);
  }

  const { data, error } = await sb.rpc('increment_ad_event', {
    p_type: type,
    p_campaign_id: campaignId,
    p_creative_id: creativeId,
    p_placement_key: placementKey,
    p_request_id: requestId,
  });
  if (error) return err('INGEST_FAILED', error.message, 500);
  if (data === false) {
    return NextResponse.json({ data: { deduped: true, requestId } });
  }
  return NextResponse.json({ data: { deduped: false, requestId } }, { status: 201 });
}
