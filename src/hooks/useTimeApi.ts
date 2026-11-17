'use client';

import { fetchJson, useList } from './useCrmApi';
import type { TimeEntry } from '@/lib/timeTypes';
import { toTimeEntry } from '@/lib/timeTypes';

export type { TimeEntry, TimeOffRequest, ShiftTemplate } from '@/lib/timeTypes';

/* fetchJson resolves with { ok: false } on API errors instead of
   throwing; mutations rethrow so callers' try/catch tells the truth. */
async function must<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data as T;
}

/* Time tracking hooks (doc 13). Entries ride the existing
   /api/v1/time-entries route; the raw rows are mapped to the
   TimeEntry DTO here. Time-off / shift-template / schedule hooks
   already exist in useCrmDomain (useTimeOffRequests, useShiftTemplates)
   and are backed by the /api/crm routes. */

export function useTimeEntries() {
  const list = useList<TimeEntry & Record<string, unknown>>('time-entries', '/api/v1/time-entries');
  return {
    ...list,
    data: (list.data || []).map((r) => toTimeEntry(r as Record<string, unknown>)),
  };
}

export const timeMutations = {
  createEntry: (body: Record<string, unknown>) =>
    must(fetchJson('/api/v1/time-entries', { method: 'POST', body: JSON.stringify(body) })),
  /** Pull a customer's unbilled billable time onto an invoice
   *  (acct_invoice_unbilled_time). */
  invoiceUnbilledTime: (invoiceId: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/invoices/${invoiceId}/unbilled-time`, { method: 'POST', body: JSON.stringify(body) })),
  decideTimeOff: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/crm/time-off-requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  createTimeOff: (body: Record<string, unknown>) =>
    must(fetchJson('/api/crm/time-off-requests', { method: 'POST', body: JSON.stringify(body) })),
  createShiftTemplate: (body: Record<string, unknown>) =>
    must(fetchJson('/api/crm/shift-templates', { method: 'POST', body: JSON.stringify(body) })),
  createBlockedTime: (body: Record<string, unknown>) =>
    must(fetchJson('/api/crm/staff-blocked-times', { method: 'POST', body: JSON.stringify(body) })),
};
