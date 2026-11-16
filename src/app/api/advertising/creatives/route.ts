import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdCreative } from '@/lib/adDto';

/* Creatives (doc 22 nav: Advertising/Creatives → ad_creatives). */

const CREATIVE_STATUSES = ['active', 'paused', 'archived'];

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const campaignId = new URL(req.url).searchParams.get('campaignId');
  const sb = supabaseAdmin();
  let query = sb.from('ad_creatives').select('*').order('created_at', { ascending: false }).limit(500);
  if (campaignId) query = query.eq('campaign_id', campaignId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAdCreative(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.campaignId) return err('VALIDATION', 'campaignId is required', 400);
  if (typeof body.name !== 'string' || !body.name.trim()) return err('VALIDATION', 'name is required', 400);
  if (typeof body.width !== 'number' || typeof body.height !== 'number') return err('VALIDATION', 'width and height are required', 400);
  const sb = supabaseAdmin();
  const { data: campaign } = await sb.from('ad_campaigns').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', String(body.campaignId)).maybeSingle();
  if (!campaign) return err('NOT_FOUND', 'Campaign not found', 404);
  let groupId = typeof body.groupId === 'string' ? body.groupId : null;
  if (!groupId) {
    const { data: group } = await sb.from('ad_campaign_groups').select('id').eq('campaign_id', String(body.campaignId)).order('created_at', { ascending: true }).limit(1).maybeSingle();
    groupId = group ? String(group.id) : null;
  }
  if (!groupId) return err('VALIDATION', 'Add an ad set to the campaign first — creatives belong to an ad set.', 400);
  const { data, error } = await sb
    .from('ad_creatives')
    .insert({
      campaign_id: String(body.campaignId),
      group_id: groupId,
      name: body.name.trim(),
      status: typeof body.status === 'string' && CREATIVE_STATUSES.includes(body.status) ? body.status : 'active',
      image_url: typeof body.imageUrl === 'string' ? body.imageUrl : null,
      asset_url: typeof body.assetUrl === 'string' ? body.assetUrl : (typeof body.imageUrl === 'string' ? body.imageUrl : ''),
      click_url: typeof body.clickUrl === 'string' ? body.clickUrl : '',
      link_url: typeof body.clickUrl === 'string' ? body.clickUrl : null,
      headline: typeof body.headline === 'string' ? body.headline : null,
      body: typeof body.body === 'string' ? body.body : null,
      cta: typeof body.cta === 'string' ? body.cta : null,
      width: body.width,
      height: body.height,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAdCreative(data as Record<string, unknown>) }, { status: 201 });
}
