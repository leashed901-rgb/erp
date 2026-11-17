import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdSet } from '@/lib/adDto';

/* Ad sets (doc 22 nav: Advertising/Ad sets → ad_campaign_groups). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const campaignId = new URL(req.url).searchParams.get('campaignId');
  const sb = supabaseAdmin();
  let query = sb.from('ad_campaign_groups').select('*').order('created_at', { ascending: false }).limit(500);
  if (campaignId) query = query.eq('campaign_id', campaignId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAdSet(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.campaignId || typeof body.name !== 'string' || !body.name.trim()) {
    return err('VALIDATION', 'campaignId and name are required', 400);
  }
  // The CHECK allows only active/paused/archived — the old 'draft'
  // default 500d every create that omitted status. Default to active.
  const ALLOWED = ['active', 'paused', 'archived'];
  const status = typeof body.status === 'string' ? body.status : 'active';
  if (!ALLOWED.includes(status)) {
    return err('VALIDATION', `status must be one of: ${ALLOWED.join(', ')}`, 400);
  }
  const sb = supabaseAdmin();
  const { data: campaign } = await sb.from('ad_campaigns').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', String(body.campaignId)).maybeSingle();
  if (!campaign) return err('NOT_FOUND', 'Campaign not found', 404);
  const { data, error } = await sb
    .from('ad_campaign_groups')
    .insert({ campaign_id: String(body.campaignId), name: body.name.trim(), status })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAdSet(data as Record<string, unknown>) }, { status: 201 });
}
