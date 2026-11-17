'use client';

import { useEffect, useState } from 'react';
import { fetchJson, useList } from './useCrmApi';
import type { PurchaseOrderDef, PurchaseOrderDetail } from '@/lib/purchasingTypes';

export type { PurchaseOrderDef, PurchaseOrderDetail };

/* Purchasing hooks (doc 15) over the v1 purchase-orders API. */

/* fetchJson resolves with { ok: false } on API errors instead of
   throwing; mutations rethrow so callers' try/catch tells the truth. */
async function must<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.data as T;
}

export function usePurchaseOrders(q?: string) {
  return useList<PurchaseOrderDef>('purchase-orders', `/api/v1/purchase-orders${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export function usePurchaseOrder(id: string | null): { data: PurchaseOrderDetail | null; refresh: () => void } {
  const [data, setData] = useState<PurchaseOrderDetail | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!id) { setData(null); return; }
    let cancelled = false;
    fetchJson(`/api/v1/purchase-orders/${id}`)
      .then((json) => { if (!cancelled) setData(((json as { data: PurchaseOrderDetail }).data) ?? null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [id, nonce]);
  return { data, refresh: () => setNonce((n) => n + 1) };
}

export const purchaseMutations = {
  create: (body: Record<string, unknown>) =>
    must(fetchJson('/api/v1/purchase-orders', { method: 'POST', body: JSON.stringify(body) })),
  update: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/v1/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
  send: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/purchase-orders/${id}/send`, { method: 'POST', body: JSON.stringify(body) })),
  receive: (id: string, body: Record<string, unknown>) =>
    must(fetchJson(`/api/v1/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(body) })),
  createBill: (id: string, body: Record<string, unknown> = {}) =>
    must(fetchJson(`/api/v1/purchase-orders/${id}/create-bill`, { method: 'POST', body: JSON.stringify(body) })),
};
