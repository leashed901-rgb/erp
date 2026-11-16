'use client';
/* Generic hook layer for registry tables (2026-11-15 sweep): every
   table served by /api/v1/data/[table] gets a real list hook and
   mutation set here, on the same useList/fetchJson plumbing as the
   hand-written domain hooks. Per-table wrappers live in
   hooks/useDataTables.ts. */
import { useList, fetchJson } from '@/hooks/useCrmApi';

export function useTableList<T extends { id: string } = Record<string, unknown> & { id: string }>(
  table: string,
  query?: Record<string, string>,
  base = '/api/v1/data',
) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const { data, loaded, error, refresh, setData } = useList<T>(`data:${base}:${table}:${qs}`, `${base}/${table}${qs}`);
  return { rows: data, loading: !loaded, error, refresh, setRows: setData };
}

export function tableMutations<T = Record<string, unknown>>(table: string, base = '/api/v1/data') {
  return {
    create: async (input: Record<string, unknown>) => {
      const res = await fetchJson<{ data: T }>(`${base}/${table}`, { method: 'POST', body: JSON.stringify(input) });
      return res.ok ? { ok: true as const, data: res.data.data } : { ok: false as const, error: res.error };
    },
    update: async (id: string, patch: Record<string, unknown>) => {
      const res = await fetchJson<{ data: T }>(`${base}/${table}`, { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
      return res.ok ? { ok: true as const, data: res.data.data } : { ok: false as const, error: res.error };
    },
    remove: async (id: string) => {
      const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`${base}/${table}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok ? { ok: true as const, data: res.data.data } : { ok: false as const, error: res.error };
    },
  };
}
