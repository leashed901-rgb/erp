import type { AdAccount, AdAdvertiser, AdAudience, AdCampaign, AdCreative, AdDailySpend, AdEvent, AdSet } from './adTypes';

/* Row → DTO mappers for the ad_* tables (doc 22). */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);
const cents = (v: unknown) => num(v) / 100;

export function toAdCampaign(r: Row, agg?: { impressions: number; clicks: number; conversions: number; spend: number; maxDaySpend?: number }, adSetCount = 0, creativeIds: string[] = []): AdCampaign {
  const impressions = agg?.impressions || 0;
  const clicks = agg?.clicks || 0;
  const dailyBudget = r.daily_budget_cents != null ? cents(r.daily_budget_cents) : null;
  const lifetimeBudget = r.lifetime_budget_cents != null ? cents(r.lifetime_budget_cents) : null;
  const lifetimeSpend = cents(r.lifetime_spend_cents);
  const spend = agg?.spend || lifetimeSpend;
  // Over-budget (module 6, USER-GUIDE row 2): recorded spend at or over
  // the lifetime budget, or any single day's spend at or over the daily
  // budget. A flag, not a block — no rule defines blocking spend.
  const overBudget =
    (lifetimeBudget != null && lifetimeBudget > 0 && spend >= lifetimeBudget) ||
    (dailyBudget != null && dailyBudget > 0 && (agg?.maxDaySpend || 0) >= dailyBudget);
  return {
    id: String(r.id),
    advertiserId: (r.advertiser_id as string) || null,
    tenantId: (r.tenant_id as string) || null,
    name: String(r.name || ''),
    status: String(r.status || 'draft'),
    startsAt: (r.starts_at as string) || null,
    endsAt: (r.ends_at as string) || null,
    dailyBudget,
    lifetimeBudget,
    lifetimeSpend,
    deliveryType: (r.delivery_type as string) || null,
    impressions,
    clicks,
    conversions: agg?.conversions || 0,
    analyticsSpend: agg?.spend || 0,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    adSetCount,
    creativeIds,
    overBudget,
    createdAt: String(r.created_at || ''),
  };
}

export const toAdSet = (r: Row): AdSet => ({
  id: String(r.id),
  campaignId: String(r.campaign_id || ''),
  name: String(r.name || ''),
  status: String(r.status || 'draft'),
  createdAt: String(r.created_at || ''),
});

export const toAdCreative = (r: Row): AdCreative => ({
  id: String(r.id),
  campaignId: String(r.campaign_id || ''),
  groupId: (r.group_id as string) || null,
  name: (r.name as string) || null,
  status: (r.status as string) || null,
  imageUrl: (r.image_url as string) || null,
  assetUrl: (r.asset_url as string) || null,
  clickUrl: (r.link_url as string) || (r.click_url as string) || null,
  headline: (r.headline as string) || null,
  body: (r.body as string) || null,
  cta: (r.cta as string) || null,
  width: r.width != null ? num(r.width) : null,
  height: r.height != null ? num(r.height) : null,
  createdAt: String(r.created_at || ''),
});

export const toAdAudience = (r: Row): AdAudience => ({
  id: String(r.id),
  organizationId: String(r.organization_id || ''),
  name: String(r.name || ''),
  criteria: (r.criteria as Record<string, unknown>) || null,
  size: r.size != null ? num(r.size) : null,
  reach: r.reach != null ? num(r.reach) : null,
  createdAt: String(r.created_at || ''),
});

export const toAdAdvertiser = (r: Row): AdAdvertiser => ({
  id: String(r.id),
  userId: (r.user_id as string) || null,
  displayName: String(r.display_name || ''),
  isSystem: Boolean(r.is_system),
  status: (r.status as string) || null,
  createdAt: String(r.created_at || ''),
});

export const toAdAccount = (r: Row): AdAccount => ({
  id: String(r.id),
  organizationId: String(r.organization_id || ''),
  name: String(r.name || ''),
  status: (r.status as string) || null,
  verified: Boolean(r.verified),
  tier: (r.tier as string) || null,
  createdAt: String(r.created_at || ''),
});

export const toAdDailySpend = (r: Row, posted = false): AdDailySpend => ({
  // ad_campaign_daily is keyed by (campaign_id, delivery_date) — no id column.
  id: `${String(r.campaign_id)}:${String(r.delivery_date)}`,
  campaignId: r.campaign_id != null ? String(r.campaign_id) : null,
  date: String(r.delivery_date || ''),
  impressions: num(r.impressions),
  clicks: num(r.clicks),
  spend: cents(r.spend_cents),
  posted,
});

export const toAdEvent = (r: Row): AdEvent => ({
  id: String(r.id),
  eventTime: String(r.event_time || ''),
  eventType: String(r.event_type || ''),
  trackingId: (r.tracking_id as string) || null,
  campaignId: (r.campaign_id as string) || null,
  creativeId: (r.creative_id as string) || null,
  deviceType: (r.device_type as string) || null,
  cpmCents: r.cpm_cents != null ? num(r.cpm_cents) : null,
});
