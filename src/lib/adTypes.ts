/* Advertising types (doc 22) — DTOs over the ad_* tables.
   Money crosses the API in dollars; the tables store cents. */

export interface AdCampaign {
  id: string;
  advertiserId: string | null;
  tenantId: string | null;
  name: string;
  status: string; // draft|scheduled|preflight|approved|active|paused|ended
  startsAt: string | null;
  endsAt: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  lifetimeSpend: number;
  deliveryType: string | null;
  /* Aggregates from ad_analytics + child counts (not stored columns). */
  impressions: number;
  clicks: number;
  conversions: number;
  analyticsSpend: number;
  ctr: number; // percent
  adSetCount: number;
  creativeIds: string[];
  /* Over-budget flag (module 6, USER-GUIDE row 2): recorded spend at or
     over the lifetime budget, or any single day's spend at or over the
     daily budget. Warns; it does not block new spend. */
  overBudget: boolean;
  createdAt: string;
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface AdCreative {
  id: string;
  campaignId: string;
  groupId: string | null;
  name: string | null;
  status: string | null;
  imageUrl: string | null;
  assetUrl: string | null;
  clickUrl: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface AdAudience {
  id: string;
  organizationId: string;
  name: string;
  criteria: Record<string, unknown> | null;
  size: number | null;
  reach: number | null;
  createdAt: string;
}

export interface AdAdvertiser {
  id: string;
  userId: string | null;
  displayName: string;
  isSystem: boolean;
  status: string | null;
  createdAt: string;
}

export interface AdAccount {
  id: string;
  organizationId: string;
  name: string;
  status: string | null;
  verified: boolean;
  tier: string | null;
  createdAt: string;
}

export interface AdDailySpend {
  id: string;
  campaignId: string | null;
  date: string;
  impressions: number;
  clicks: number;
  spend: number; // dollars
  posted: boolean; // an expense already posted for this date
}

export interface AdEvent {
  id: string;
  eventTime: string;
  eventType: string;
  trackingId: string | null;
  campaignId: string | null;
  creativeId: string | null;
  deviceType: string | null;
  cpmCents: number | null;
}
