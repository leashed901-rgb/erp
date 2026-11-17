import { useEffect, useState } from 'react';
import { fetchJson, useList } from './useCrmApi';
import type { AdAccount, AdAdvertiser, AdAudience, AdCampaign, AdCreative, AdDailySpend, AdEvent, AdSet } from '@/lib/adTypes';

/* Advertising hooks (doc 22) over /api/advertising. useList is the
   house cache-first list hook; the transform unwraps { data }. */

async function must<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data as T;
}

const unwrap = <T,>(raw: unknown): T[] => ((raw as { data?: T[] })?.data ?? []) as T[];

export function useAdCampaigns() {
  const { data, loaded, error, refresh } = useList<AdCampaign>('adCampaigns', '/api/advertising/campaigns', (raw) => unwrap<AdCampaign>(raw));
  return { campaigns: data, loading: !loaded, error, refresh };
}

export function useAdSets(campaignId?: string) {
  const url = campaignId ? `/api/advertising/ad-sets?campaignId=${campaignId}` : '/api/advertising/ad-sets';
  const { data, loaded, error, refresh } = useList<AdSet>(`adSets:${campaignId || 'all'}`, url, (raw) => unwrap<AdSet>(raw));
  return { adSets: data, loading: !loaded, error, refresh };
}

export function useAdCreatives(campaignId?: string) {
  const url = campaignId ? `/api/advertising/creatives?campaignId=${campaignId}` : '/api/advertising/creatives';
  const { data, loaded, error, refresh } = useList<AdCreative>(`adCreatives:${campaignId || 'all'}`, url, (raw) => unwrap<AdCreative>(raw));
  return { creatives: data, loading: !loaded, error, refresh };
}

export function useAdAudiences() {
  const { data, loaded, error, refresh } = useList<AdAudience>('adAudiences', '/api/advertising/audiences', (raw) => unwrap<AdAudience>(raw));
  return { audiences: data, loading: !loaded, error, refresh };
}

export function useAdAdvertisers() {
  const { data, loaded, error, refresh } = useList<AdAdvertiser>('adAdvertisers', '/api/advertising/advertisers', (raw) => unwrap<AdAdvertiser>(raw));
  return { advertisers: data, loading: !loaded, error, refresh };
}

export function useAdAccounts() {
  const { data, loaded, error, refresh } = useList<AdAccount>('adAccounts', '/api/advertising/accounts', (raw) => unwrap<AdAccount>(raw));
  return { accounts: data, loading: !loaded, error, refresh };
}

export function useAdSpend() {
  const { data, loaded, error, refresh } = useList<AdDailySpend>('adSpend', '/api/advertising/spend', (raw) => unwrap<AdDailySpend>(raw));
  return { spend: data, loading: !loaded, error, refresh };
}

export function useAdEvents() {
  const { data, loaded, error, refresh } = useList<AdEvent & { counts?: Record<string, number> }>('adEvents', '/api/advertising/events', (raw) => {
    const payload = (raw as { data?: { events: AdEvent[] } })?.data;
    return (payload?.events ?? []) as (AdEvent & { counts?: Record<string, number> })[];
  });
  return { events: data, loading: !loaded, error, refresh };
}

export interface AdJournalRow { id: string; date: string; amount: number; account: string; memo: string; status: string }
export interface AdReconRow { id: string; account: string; name: string; debits: number; ledger: number; state: string; lastLocked: string }

export function useAdSpendExpenses() {
  const [journals, setJournals] = useState<AdJournalRow[]>([]);
  const [recon, setRecon] = useState<AdReconRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetchJson('/api/advertising/spend/expenses').then((r) => {
      if (!live) return;
      if (r.ok) {
        const payload = r.data as { journals: AdJournalRow[]; recon: AdReconRow[] } | undefined;
        if (payload) { setJournals(payload.journals || []); setRecon(payload.recon || []); }
      }
      setLoaded(true);
    });
    return () => { live = false; };
  }, [tick]);
  return { journals, recon, loading: !loaded, refresh: () => setTick((t) => t + 1) };
}

export const adMutations = {
  createAccount: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/accounts', { method: 'POST', body: JSON.stringify(body) })),
  createCampaign: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/campaigns', { method: 'POST', body: JSON.stringify(body) })),
  updateCampaign: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/advertising/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  createAdSet: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/ad-sets', { method: 'POST', body: JSON.stringify(body) })),
  updateAdSet: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/advertising/ad-sets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  createCreative: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/creatives', { method: 'POST', body: JSON.stringify(body) })),
  updateCreative: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/advertising/creatives/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  createAudience: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/audiences', { method: 'POST', body: JSON.stringify(body) })),
  updateAudience: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/advertising/audiences/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  createAdvertiser: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/advertisers', { method: 'POST', body: JSON.stringify(body) })),
  updateAdvertiser: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/advertising/advertisers/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  postSpendDay: (date: string) =>
    must(fetchJson('/api/advertising/spend/post', { method: 'POST', body: JSON.stringify({ date }) })),
};

/* Pixels: definitions are tenant configuration (policy_settings);
   stats ride along from the real ad_events stream. */
export interface AdPixel {
  id: string;
  defined: boolean;
  name: string;
  network: string;
  pixelId: string;
  install: string;
  status: string;
  events: { name: string; kind: string; valueField?: string }[];
  events24: number;
  events30: number;
  lastEvent: string | null;
}

export function usePixels() {
  const { data, loaded, error, refresh } = useList<AdPixel>('adPixels', '/api/advertising/pixels', (raw) => unwrap<AdPixel>(raw));
  return { pixels: data, loading: !loaded, error, refresh };
}

export const pixelMutations = {
  create: (body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/pixels', { method: 'POST', body: JSON.stringify(body) })),
  update: (id: string, body: Record<string, unknown>) =>
    must(fetchJson('/api/advertising/pixels', { method: 'PATCH', body: JSON.stringify({ id, ...body }) })),
  remove: (id: string) =>
    must(fetchJson(`/api/advertising/pixels?id=${encodeURIComponent(id)}`, { method: 'DELETE' })),
};
