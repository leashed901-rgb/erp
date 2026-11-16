import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdCampaign } from '@/lib/adDto';

/* Campaigns (doc 22: create.campaign → ad_campaigns). Performance
   aggregates come from ad_campaign_daily (the per-campaign delivery
   table — ad_analytics keys campaigns by an unrelated uuid and does
   not join); ad-set counts from ad_campaign_groups; creative ids
   from ad_creatives. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ad_campaigns')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data || []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  const agg = new Map<string, { impressions: number; clicks: number; conversions: number; spend: number; maxDaySpend: number }>();
  const setCounts = new Map<string, number>();
  const creativeIds = new Map<string, string[]>();
  if (ids.length) {
    const [analytics, groups, creatives] = await Promise.all([
      sb.from('ad_campaign_daily').select('campaign_id, impressions, clicks, spend_cents').in('campaign_id', ids),
      sb.from('ad_campaign_groups').select('campaign_id').in('campaign_id', ids),
      sb.from('ad_creatives').select('id, campaign_id').in('campaign_id', ids),
    ]);
    (analytics.data || []).forEach((a) => {
      const key = String(a.campaign_id);
      const cur = agg.get(key) || { impressions: 0, clicks: 0, conversions: 0, spend: 0, maxDaySpend: 0 };
      const daySpend = (Number(a.spend_cents) || 0) / 100;
      cur.impressions += Number(a.impressions) || 0;
      cur.clicks += Number(a.clicks) || 0;
      cur.spend += daySpend;
      cur.maxDaySpend = Math.max(cur.maxDaySpend, daySpend);
      agg.set(key, cur);
    });
    (groups.data || []).forEach((g) => { const k = String(g.campaign_id); setCounts.set(k, (setCounts.get(k) || 0) + 1); });
    (creatives.data || []).forEach((c) => {
      const k = String(c.campaign_id);
      const list = creativeIds.get(k) || [];
      list.push(String(c.id));
      creativeIds.set(k, list);
    });
  }
  return NextResponse.json({ data: rows.map((r) => toAdCampaign(r, agg.get(String(r.id)), setCounts.get(String(r.id)) || 0, creativeIds.get(String(r.id)) || [])) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  let advertiserId = typeof body.advertiserId === 'string' ? body.advertiserId : null;
  if (!advertiserId) {
    const { data: first } = await sb.from('ad_advertisers').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    advertiserId = (first?.id as string) || null;
  }
  if (!advertiserId) return err('VALIDATION', 'Create an advertiser first — campaigns belong to an advertiser.', 400);
  const dollarsToCents = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v * 100) : 0);
  // starts_at / ends_at are NOT NULL with ends_at > starts_at: every
  // campaign carries a flight window (default: starts now, 30 days).
  const startsAt = typeof body.startsAt === 'string' && body.startsAt ? body.startsAt : new Date().toISOString();
  const endsAt = typeof body.endsAt === 'string' && body.endsAt ? body.endsAt : new Date(new Date(startsAt).getTime() + 30 * 86400000).toISOString();
  // tier_id is required by the schema — the campaign runs on an
  // ad_tiers delivery tier (platform reference data).
  let tierId = typeof body.tierId === 'string' ? body.tierId : null;
  if (!tierId) {
    const { data: tier } = await sb.from('ad_tiers').select('id').eq('active', true).order('priority', { ascending: true }).limit(1).maybeSingle();
    tierId = (tier?.id as string) || null;
  }
  if (!tierId) return err('VALIDATION', 'No ad delivery tier is configured (ad_tiers is empty) — campaigns require a tier.', 400);
  const { data, error } = await sb
    .from('ad_campaigns')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      advertiser_id: advertiserId,
      tier_id: tierId,
      name,
      status: typeof body.status === 'string' ? body.status : 'draft',
      starts_at: startsAt,
      ends_at: endsAt,
      daily_budget_cents: dollarsToCents(body.dailyBudget),
      lifetime_budget_cents: dollarsToCents(body.lifetimeBudget),
      delivery_type: typeof body.deliveryType === 'string' ? body.deliveryType : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAdCampaign(data as Record<string, unknown>) }, { status: 201 });
}
