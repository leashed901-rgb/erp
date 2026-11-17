'use client';
/* useSocialApi — client data layer for the Social Publishing screens
   (doc 23). Same pattern as useSellersApi: cache-first useList hooks
   + mutation helpers returning { ok, error, data }. */
import { useList, fetchJson } from '@/hooks/useCrmApi';
import type {
  SocialPost,
  SocialAccount,
  ScheduleSlot,
  MediaAsset,
  NetworkPerformance,
} from '@/lib/socialTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

export function useSocialPosts(status?: string) {
  const url = status ? `/api/social/posts?status=${status}` : '/api/social/posts';
  const { data, loaded, error, refresh, setData } = useList<SocialPost>(
    'socialPosts:' + (status || 'all'),
    url,
    (raw) => ((raw as { data?: SocialPost[] })?.data ?? []) as SocialPost[],
  );
  return { posts: data, loading: !loaded, error, refresh, setPosts: setData };
}

export function useSocialAccounts() {
  const { data, loaded, error, refresh, setData } = useList<SocialAccount>(
    'socialAccounts',
    '/api/social/accounts',
    (raw) => ((raw as { data?: SocialAccount[] })?.data ?? []) as SocialAccount[],
  );
  return { accounts: data, loading: !loaded, error, refresh, setAccounts: setData };
}

export function useScheduleSlots() {
  const { data, loaded, error, refresh } = useList<ScheduleSlot>(
    'socialSlots',
    '/api/social/slots',
    (raw) => ((raw as { data?: ScheduleSlot[] })?.data ?? []) as ScheduleSlot[],
  );
  return { slots: data, loading: !loaded, error, refresh };
}

export function useMediaAssets() {
  const { data, loaded, error, refresh } = useList<MediaAsset>(
    'socialAssets',
    '/api/social/assets',
    (raw) => ((raw as { data?: MediaAsset[] })?.data ?? []) as MediaAsset[],
  );
  return { assets: data, loading: !loaded, error, refresh };
}

export function useSocialPerformance() {
  const { data, loaded, error, refresh } = useList<{ byNetwork: NetworkPerformance[]; posts: Record<string, number> } & { id: string }>(
    'socialPerformance',
    '/api/social/performance',
    (raw) => {
      const d = (raw as { data?: { byNetwork: NetworkPerformance[]; posts: Record<string, number> } })?.data;
      return d ? [{ id: 'perf', ...d }] : [];
    },
  );
  return { performance: data[0] || null, loading: !loaded, error, refresh };
}

export interface OversightRule {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}

export function useOversightRules() {
  const { data, loaded, error, refresh } = useList<OversightRule & { id: string }>(
    'oversightRules',
    '/api/social/oversight-rules',
    (raw) => ((raw as { data?: OversightRule[] })?.data ?? []) as (OversightRule & { id: string })[],
  );
  return { rules: data as OversightRule[], loading: !loaded, error, refresh };
}

export const socialMutations = {
  saveOversightRules: (rules: { id: string; enabled: boolean }[]) =>
    call<OversightRule[]>('/api/social/oversight-rules', { method: 'PUT', body: JSON.stringify({ rules }) }),

  createPost: (input: {
    caption: string;
    title?: string;
    channels: string[];
    scheduledAt?: string | null;
    publishNow?: boolean;
    mediaUrls?: string[];
    sourceType?: string;
    sourceId?: string;
    productUrl?: string;
    linkUrl?: string;
  }) => call<SocialPost>('/api/social/posts', { method: 'POST', body: JSON.stringify(input) }),

  updatePost: (id: string, patch: Record<string, unknown>) =>
    call<SocialPost>(`/api/social/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deletePost: (id: string) => call<{ id: string; deleted: boolean }>(`/api/social/posts/${id}`, { method: 'DELETE' }),

  retryPost: (id: string) =>
    call<{ targetsRetried: number; networksRetried: number }>(`/api/social/posts/${id}/retry`, { method: 'POST' }),

  createAccount: (input: { network: string; handle: string; displayName?: string }) =>
    call<SocialAccount>('/api/social/accounts', { method: 'POST', body: JSON.stringify(input) }),

  updateAccount: (id: string, patch: Record<string, unknown>) =>
    call<SocialAccount>(`/api/social/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteAsset: (id: string) => call<{ id: string; deleted: boolean }>(`/api/social/assets/${id}`, { method: 'DELETE' }),

  createSlot: (input: { weekday: number; timeLocal: string; label?: string; timezone?: string }) =>
    call<ScheduleSlot>('/api/social/slots', { method: 'POST', body: JSON.stringify(input) }),

  updateSlot: (id: string, patch: Record<string, unknown>) =>
    call<ScheduleSlot>(`/api/social/slots/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteSlot: (id: string) => call<{ id: string; deleted: boolean }>(`/api/social/slots/${id}`, { method: 'DELETE' }),

  createAsset: (input: { storagePath: string; mimeType: string; sizeBytes?: number; storageBucket?: string }) =>
    call<MediaAsset>('/api/social/assets', { method: 'POST', body: JSON.stringify(input) }),
};
