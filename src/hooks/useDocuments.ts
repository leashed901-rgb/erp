'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DocumentType } from '@/lib/contracts';

/**
 * useDocuments — the hook for the Document Engine API (spec §B.4.4).
 * Fetches documents from /api/v1/documents?type=X, which routes to
 * the REAL accounting tables (acct_ar_invoices, acct_ap_bills, etc.)
 * — NOT platformStore seed data.
 *
 * This replaces every usePlatformStore() call in finance screens.
 */

export function useDocuments(type: DocumentType | null, partyId?: string) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!type) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    const params = new URLSearchParams({ type });
    if (partyId) {
      // The API accepts customer_id or vendor_id depending on type
      const isVendorType = type === 'Bill' || type === 'PurchaseOrder' || type === 'VendorCredit';
      params.set(isVendorType ? 'vendor_id' : 'customer_id', partyId);
    }
    fetch(`/api/v1/documents?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setData(json.data || []);
        setError(json.error?.message || null);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [type, partyId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loaded, error, refresh };
}

/** Create a document via the Document Engine API. */
export async function createDocument(type: DocumentType, body: Record<string, unknown>): Promise<{ data?: unknown; error?: string }> {
  try {
    const res = await fetch('/api/v1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, type }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Update a document via PATCH. */
export async function updateDocument(type: DocumentType, id: string, updates: Record<string, unknown>): Promise<{ data?: unknown; error?: string }> {
  try {
    const res = await fetch(`/api/v1/documents/${id}?type=${type}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Execute a document verb (send, void, convert, pay, receive). */
export async function documentVerb(type: DocumentType, id: string, verb: string, body?: Record<string, unknown>): Promise<{ data?: unknown; error?: string; message?: string }> {
  try {
    const res = await fetch(`/api/v1/documents/${id}/${verb}?type=${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data, message: json.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}
