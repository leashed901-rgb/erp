'use client';

import { useEffect, useState } from 'react';
import { fetchJson, useList } from './useCrmApi';
import type { Order, OrderDetail, ShippingLabel, BatchSlip, Carrier, ShippingMethod } from '@/lib/orderTypes';

export type { Order, OrderDetail, ShippingLabel, BatchSlip, Carrier, ShippingMethod };

/* Orders & fulfillment hooks (doc 14) over the v1 orders API. */

/* fetchJson resolves with { ok: false } on API errors instead of
   throwing; mutations rethrow so callers' try/catch tells the truth. */
async function must<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data as T;
}

export function useOrders(q?: string) {
  return useList<Order>('orders', `/api/v1/orders${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

function useOne<T>(key: string, path: string | null): { data: T | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let cancelled = false;
    fetchJson(path)
      .then((json) => { if (!cancelled) setData((json as { data: T }).data ?? null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, nonce]);
  return { data, refresh: () => setNonce((n) => n + 1) };
}

export function useOrder(id: string | null) {
  return useOne<OrderDetail>(`order-${id || 'none'}`, id ? `/api/v1/orders/${id}` : null);
}

export function useOrderLabels(orderId: string | null) {
  return useList<ShippingLabel>(`labels-${orderId || 'none'}`, orderId ? `/api/v1/orders/${orderId}/labels` : '/api/v1/orders/__none__/labels');
}

export function useBatchSlips() {
  return useList<BatchSlip>('batch-slips', '/api/v1/orders/batch-labels');
}

export interface RateProfile { id: string; methodName: string; firstItemCost: number | null; additionalItemCost: number | null; minDays: number | null; maxDays: number | null }
export interface CarrierBundle { carriers: Carrier[]; methods: ShippingMethod[]; profiles?: RateProfile[]; avgLabelCost?: number | null; onTimeRate?: number | null }

export function useCarriers() {
  return useOne<CarrierBundle>('carriers', '/api/v1/shipping/carriers');
}

export const orderMutations = {
  markShipped: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/orders/${id}/mark-shipped`, { method: 'POST', body: JSON.stringify(body) })),
  refund: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/v1/orders/${id}/refund`, { method: 'POST', body: JSON.stringify(body) })),
  cancel: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) })),
  hold: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/orders/${id}/hold`, { method: 'POST', body: JSON.stringify(body) })),
  release: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/orders/${id}/release`, { method: 'POST', body: JSON.stringify(body) })),
  addNote: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/v1/orders/${id}/notes`, { method: 'POST', body: JSON.stringify(body) })),
  reportProblem: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/v1/orders/${id}/report-problem`, { method: 'POST', body: JSON.stringify(body) })),
  createLabel: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/orders/${id}/labels`, { method: 'POST', body: JSON.stringify(body) })),
  createBatch: (body: Record<string, unknown>) =>
    must(fetchJson('/api/v1/orders/batch-labels', { method: 'POST', body: JSON.stringify(body) })),
  setCarrierActive: (id: string, active: boolean) =>
    must(fetchJson(`/api/v1/shipping/carriers/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) })),
  setFulfillmentStatus: (id: string, status: string, trackingNumber?: string) =>
    must(fetchJson(`/api/v1/orders/fulfillment/${id}/status`, { method: 'POST', body: JSON.stringify({ status, trackingNumber }) })),
};
