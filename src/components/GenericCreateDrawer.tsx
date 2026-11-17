'use client';

import { useEffect, useState } from 'react';
import { TABLE_REGISTRY } from '@/lib/tableRegistry';
import { TABLE_POST_ROUTES } from '@/lib/tablePostRoutes';

/**
 * GenericCreateDrawer — the one create component every table funnels
 * into when it has no bespoke form. Given a table it renders a field
 * per writable column (from the data-layer registry, or from a live
 * sample row when the table has a hand-written route), coerces values
 * by column-name heuristics, and POSTs to the table's insert route:
 *   1. /api/v1/data/[table] when the table is registry-writable
 *   2. the hand-written POST route from TABLE_POST_ROUTES
 *   3. otherwise an honest error — never a silent toast.
 * System columns (id, tenant_id, created_at, updated_at, metadata)
 * are never shown. Empty fields are omitted so DB defaults apply.
 */

const SKIP = new Set(['id', 'tenant_id', 'created_at', 'updated_at', 'metadata']);
const NUM_HINT = /amount|total|price|count|qty|quantity|score|minutes|credits|probability|percent|rate|balance|weight|length|width|height|sort_order|version/i;
const BOOL_HINT = /^(is_|has_)/;

function coerce(col: string, raw: string): unknown {
  const v = raw.trim();
  if (BOOL_HINT.test(col)) {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  if (NUM_HINT.test(col) && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function pretty(col: string): string {
  return col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GenericCreateDrawer({
  open,
  table,
  title,
  screenKey,
  onClose,
  onSaved,
  onToast,
}: {
  open: boolean;
  table: string | null;
  title: string;
  screenKey?: string;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const [cols, setCols] = useState<string[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !table) return;
    setValues({});
    setError(null);
    const reg = TABLE_REGISTRY[table];
    if (reg) {
      setCols(reg.columns.filter((c) => !SKIP.has(c)));
      return;
    }
    // Hand-written route table: derive fields from a live sample row.
    let cancelled = false;
    setCols(null);
    const url = screenKey
      ? `/api/list-rows?screen=${encodeURIComponent(screenKey)}&table=${encodeURIComponent(table)}`
      : `/api/list-rows?screen=${encodeURIComponent(table)}&table=${encodeURIComponent(table)}`;
    fetch(url)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        const rows = (json.data || []) as Record<string, unknown>[];
        if (rows.length > 0) {
          setCols(Object.keys(rows[0]).filter((k) => !SKIP.has(k)));
        } else {
          setCols([]);
        }
      })
      .catch(() => { if (!cancelled) setCols([]); });
    return () => { cancelled = true; };
  }, [open, table, screenKey]);

  if (!open || !table) return null;

  const reg = TABLE_REGISTRY[table];
  const postUrl = reg?.writable ? `/api/v1/data/${encodeURIComponent(table)}` : TABLE_POST_ROUTES[table];
  const canSave = !!postUrl && !!cols && cols.length > 0;

  async function save() {
    if (!postUrl) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const c of cols || []) {
      const v = (values[c] || '').trim();
      if (v) body[c] = coerce(c, v);
    }
    try {
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || `Create failed (${res.status})`);
      onToast(`Created ${title}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 420, maxWidth: '92vw', background: '#fff', height: '100%', overflowY: 'auto', padding: 20, boxShadow: '-4px 0 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>New {title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: '#5a6355', margin: '6px 0 16px' }}>
          {table} — fields left blank use the database default.
        </p>
        {cols === null && <p style={{ fontSize: 13 }}>Loading fields…</p>}
        {cols !== null && cols.length === 0 && (
          <p style={{ fontSize: 13, color: '#b3261e' }}>
            No writable fields are known for this table yet — it has no rows to sample and no registered columns. Add a row through its own screen or import.
          </p>
        )}
        {cols !== null && cols.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cols.map((c) => (
              <label key={c} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{pretty(c)}</span>
                {BOOL_HINT.test(c) ? (
                  <select
                    value={values[c] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #c4c6c0', borderRadius: 6 }}
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[c] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                    placeholder={pretty(c)}
                    style={{ padding: '8px 10px', border: '1px solid #c4c6c0', borderRadius: 6 }}
                  />
                )}
              </label>
            ))}
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: '#b3261e', marginTop: 12 }}>{error}</p>}
        {!postUrl && cols !== null && (
          <p style={{ fontSize: 13, color: '#b3261e', marginTop: 12 }}>
            No insert route is registered for {table} — this table is read-only through the generic layer. Its own screen must provide the create flow.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            style={{ padding: '10px 18px', background: canSave ? '#0a6400' : '#aaa', color: '#fff', border: 'none', borderRadius: 6, cursor: canSave ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', background: '#fff', border: '1px solid #c4c6c0', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
