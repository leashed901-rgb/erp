'use client';
/* useMarketingApi — client data layer for the Promotions /
   Newsletter / Automation screens (doc 24). Campaigns ride the
   existing /api/crm/campaigns routes; the send action is the
   marketing route that enqueues through email_outbox. */
import { useList, fetchJson } from '@/hooks/useCrmApi';
import type {
  Promotion,
  Campaign,
  AutomationFlow,
  Webform,
  Subscriber,
  Suppression,
} from '@/lib/marketingTypes';
import { toCampaign } from '@/lib/marketingTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/* ── Promotions ── */
export function usePromotions() {
  const { data, loaded, error, refresh, setData } = useList<Promotion>(
    'promotions',
    '/api/marketing/promotions',
    (raw) => ((raw as { data?: Promotion[] })?.data ?? []) as Promotion[],
  );
  return { promotions: data, loading: !loaded, error, refresh, setPromotions: setData };
}

export const promotionMutations = {
  create: (input: Record<string, unknown>) => call<Promotion>('/api/marketing/promotions', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    call<Promotion>(`/api/marketing/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => call<{ id: string; deleted: boolean }>(`/api/marketing/promotions/${id}`, { method: 'DELETE' }),
};

/* ── Campaigns (newsletter) ── */
export function useCampaigns() {
  const { data, loaded, error, refresh, setData } = useList<Campaign>(
    'crmCampaigns',
    '/api/crm/campaigns',
    (raw) => (((raw as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[]).map(toCampaign),
  );
  return { campaigns: data, loading: !loaded, error, refresh, setCampaigns: setData };
}

export const campaignMutations = {
  create: async (input: { name: string; segment: Record<string, unknown>; scheduledAt?: string | null; templateId?: string | null; status?: string }) => {
    const res = await call<Record<string, unknown>>('/api/crm/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        campaign_type: 'email',
        channel: 'email',
        status: input.status || 'draft',
        segment_definition: input.segment,
        scheduled_at: input.scheduledAt || null,
        template_id: input.templateId || null,
      }),
    });
    return res.ok && res.data ? { ok: true, data: toCampaign(res.data) } : { ok: false, error: res.error };
  },
  update: async (id: string, patch: Record<string, unknown>) => {
    const res = await call<Record<string, unknown>>(`/api/crm/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return res.ok && res.data ? { ok: true, data: toCampaign(res.data) } : { ok: false, error: res.error };
  },
  remove: (id: string) => call<{ id: string }>(`/api/crm/campaigns/${id}`, { method: 'DELETE' }),
  send: (id: string, content?: { subject?: string; html?: string; text?: string }) =>
    call<{ enqueued: number; from: string }>(`/api/marketing/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify(content || {}) }),
  testSend: (input: { to: string; subject?: string; html?: string; text?: string }) =>
    call<{ outboxId: string; to: string }>('/api/marketing/campaigns/test', { method: 'POST', body: JSON.stringify(input) }),
};

export interface CampaignStat { campaignId: string; sent: number; opens: number; clicks: number }

export function useCampaignStats() {
  const { data, loaded, refresh } = useList<CampaignStat & { id: string }>(
    'campaignStats',
    '/api/marketing/campaigns/stats',
    (raw) => (((raw as { data?: CampaignStat[] })?.data ?? []) as CampaignStat[]).map((s) => ({ ...s, id: s.campaignId })),
  );
  return { stats: data, statsLoaded: loaded, refreshStats: refresh };
}

/* ── Subscribers + suppressions ── */
export function useSubscribers() {
  const { data, loaded, error, refresh, setData } = useList<Subscriber>(
    'newsletterSubscribers',
    '/api/marketing/subscribers',
    (raw) => ((raw as { data?: Subscriber[] })?.data ?? []) as Subscriber[],
  );
  return { subscribers: data, loading: !loaded, error, refresh, setSubscribers: setData };
}

export function useSuppressions() {
  const { data, loaded, error, refresh } = useList<Suppression>(
    'marketingSuppressions',
    '/api/marketing/suppressions',
    (raw) => ((raw as { data?: Suppression[] })?.data ?? []) as Suppression[],
  );
  return { suppressions: data, loading: !loaded, error, refresh };
}

export const subscriberMutations = {
  add: (email: string, source?: string) =>
    call<Subscriber>('/api/marketing/subscribers', { method: 'POST', body: JSON.stringify({ email, source: source || 'admin', confirmed: true }) }),
  remove: (id: string) => call<{ id: string; deleted: boolean }>(`/api/marketing/subscribers?id=${id}`, { method: 'DELETE' }),
  suppress: (contact: string, reason?: string) =>
    call<Suppression>('/api/marketing/suppressions', { method: 'POST', body: JSON.stringify({ contact, channel: 'email', source: 'admin', reason }) }),
};

/* ── Automations ── */
export interface AutomationRun {
  id: string;
  workflowId: string;
  workflowName: string;
  enrollmentId: string | null;
  actionType: string;
  status: string;
  result: 'Success' | 'Failed' | 'Pending';
  scheduledFor: string | null;
  executedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AutomationRunStats {
  runs7d: number;
  success: number;
  lastRun: string | null;
}

export function useAutomationRuns(workflowId?: string) {
  const url = workflowId ? `/api/marketing/automations/runs?workflowId=${workflowId}` : '/api/marketing/automations/runs';
  const { data, loaded, error, refresh } = useList<{ id: string; runs: AutomationRun[]; stats: Record<string, AutomationRunStats> }>(
    'automationRuns:' + (workflowId || 'all'),
    url,
    (raw) => {
      const d = (raw as { data?: { runs: AutomationRun[]; stats: Record<string, AutomationRunStats> } })?.data;
      return d ? [{ id: 'runs', ...d }] : [];
    },
  );
  const first = data[0];
  return { runs: first?.runs ?? [], stats: first?.stats ?? {}, loading: !loaded, error, refresh };
}

export function useAutomations() {
  const { data, loaded, error, refresh, setData } = useList<AutomationFlow>(
    'automationFlows',
    '/api/marketing/automations',
    (raw) => ((raw as { data?: AutomationFlow[] })?.data ?? []) as AutomationFlow[],
  );
  return { flows: data, loading: !loaded, error, refresh, setFlows: setData };
}

export const automationMutations = {
  create: (input: Record<string, unknown>) => call<AutomationFlow>('/api/marketing/automations', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    call<AutomationFlow>(`/api/marketing/automations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => call<{ id: string; deleted: boolean }>(`/api/marketing/automations/${id}`, { method: 'DELETE' }),
};

/* ── Webforms ── */
export function useWebforms() {
  const { data, loaded, error, refresh, setData } = useList<Webform>(
    'webforms',
    '/api/marketing/webforms',
    (raw) => ((raw as { data?: Webform[] })?.data ?? []) as Webform[],
  );
  return { webforms: data, loading: !loaded, error, refresh, setWebforms: setData };
}

export const webformMutations = {
  create: (input: Record<string, unknown>) => call<Webform>('/api/marketing/webforms', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    call<Webform>(`/api/marketing/webforms/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => call<{ id: string; deleted: boolean }>(`/api/marketing/webforms/${id}`, { method: 'DELETE' }),
};

/** One webform with its submissions inbox (GET /api/marketing/webforms/[id]). */
export async function fetchWebformDetail(id: string): Promise<MutationResult<{ form: Webform; submissions: import('@/lib/marketingTypes').WebformSubmission[] }>> {
  return call<{ form: Webform; submissions: import('@/lib/marketingTypes').WebformSubmission[] }>(`/api/marketing/webforms/${id}`);
}

/** Mail queue depth + drain trigger for the newsletter screen's send status. */
export const mailMutations = {
  drain: (limit?: number) =>
    call<{ claimed: number; sent: number; failed: number; errors: string[] }>('/api/marketing/mail/drain', {
      method: 'POST',
      body: JSON.stringify({ limit: limit || 50 }),
    }),
  counts: () => call<{ counts: Record<string, number> }>('/api/marketing/mail/drain'),
};
