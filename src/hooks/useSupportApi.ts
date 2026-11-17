'use client';
/* useSupportApi — client data layer for Support (doc 26).
   Tickets ride the /api/v1/tickets family; config + on-call ride
   /api/support/*. */
import { useCallback, useEffect, useState } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';
import { toTicket, toTicketEvent } from '@/lib/supportTypes';
import type {
  Ticket, TicketEvent, SlaPolicy, Macro, SupportQueue, RoutingRule,
  SupportAutomation, BusinessHours, Holiday, KbArticle, CannedReply,
  OncallSchedule, EscalationPolicy, SupportPage, SupportContextCard,
} from '@/lib/supportTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

export function useTickets() {
  const { data, loaded, error, refresh, setData } = useList<Ticket>(
    'supportTickets',
    '/api/v1/tickets',
    (raw) => (((raw as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[]).map(toTicket),
  );
  return { tickets: data, loading: !loaded, error, refresh, setTickets: setData };
}

export function useTicketThread(ticketId: string | null) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!ticketId) { setEvents([]); setLoaded(true); return; }
    const res = await fetchJson<{ data: Record<string, unknown>[] }>(`/api/v1/tickets/${ticketId}/messages`);
    if (res.ok) setEvents((res.data.data || []).map(toTicketEvent));
    setLoaded(true);
  }, [ticketId]);
  useEffect(() => { setLoaded(false); refresh(); }, [refresh]);
  return { events, setEvents, loaded, refresh };
}

export function useTicketContext(ticketId: string | null) {
  const [card, setCard] = useState<SupportContextCard | null>(null);
  useEffect(() => {
    if (!ticketId) { setCard(null); return; }
    let cancelled = false;
    fetchJson<{ data: SupportContextCard }>(`/api/v1/tickets/${ticketId}/context`).then((res) => {
      if (!cancelled && res.ok) setCard(res.data.data);
    });
    return () => { cancelled = true; };
  }, [ticketId]);
  return card;
}

export function useKbSuggestions(q: string) {
  const { data } = useList<KbArticle>('supportKbAll', '/api/support/kb', (raw) => ((raw as { data?: KbArticle[] })?.data ?? []) as KbArticle[]);
  const needle = q.trim().toLowerCase();
  if (!needle) return data.slice(0, 5);
  return data.filter((a) => `${a.title} ${a.summary || ''} ${a.collection}`.toLowerCase().includes(needle)).slice(0, 5);
}

export function useMacros() {
  const { data, loaded, refresh } = useList<Macro>('supportMacros', '/api/support/macros', (raw) => ((raw as { data?: Macro[] })?.data ?? []) as Macro[]);
  return { macros: data, loading: !loaded, refresh };
}

export const ticketMutations = {
  create: (input: Record<string, unknown>) =>
    call<Record<string, unknown>>('/api/v1/tickets', { method: 'POST', body: JSON.stringify(input) }),
  patch: (id: string, patch: Record<string, unknown>) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setStatus: (id: string, status: string) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  assign: (id: string, staffId: string | null) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ assigned_staff_id: staffId }) }),
  autoAssign: (id: string) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/auto-assign`, { method: 'POST' }),
  addMessage: (id: string, input: Record<string, unknown>) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  merge: (id: string, intoId: string) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/merge`, { method: 'POST', body: JSON.stringify({ intoId }) }),
  applyMacro: (id: string, macroId: string) =>
    call<Record<string, unknown>>(`/api/v1/tickets/${id}/macro`, { method: 'POST', body: JSON.stringify({ macroId }) }),
  remove: (id: string) =>
    call<{ id: string; deleted: boolean }>(`/api/v1/tickets/${id}`, { method: 'DELETE' }),
};

export function useSupportConfig<T extends { id: string }>(key: string, path: string) {
  const { data, loaded, error, refresh } = useList<T>(key, path, (raw) => ((raw as { data?: T[] })?.data ?? []) as T[]);
  return { rows: data, loading: !loaded, error, refresh };
}

export type { SlaPolicy, Macro, SupportQueue, RoutingRule, SupportAutomation, BusinessHours, Holiday, KbArticle, CannedReply, OncallSchedule, EscalationPolicy, SupportPage };
