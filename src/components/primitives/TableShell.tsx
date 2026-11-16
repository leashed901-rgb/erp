'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ViewDef } from '@/lib/contracts';
import { Pill } from './Pill';
import { ContextMenu } from './ContextMenu';
import { exportToCsv } from '@/lib/csvExport';
import { importCsvFile } from '@/lib/csvImport';

/**
 * TableShell — the config-driven table (spec §B.2.2, §1.5).
 * Renders any list from a ViewDef: columns, status tabs, filters,
 * sorts, row click, bulk bar, totals footer, import/export.
 *
 * The same component renders invoices, bills, parties, leads, etc.
 */
export function TableShell({ view, onRowOpen, onToast }: {
  view: ViewDef;
  onRowOpen?: (id: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState(view.defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState(view.statusTabs?.[0]?.id || 'all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nonce, setNonce] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowId: string } | null>(null);
  // Column filters (view.filters) — applied to the loaded rows. The
  // shell shipped rendering NO filter controls at all, and its
  // Import/Export/bulk buttons were toasts; all three are real now.
  const [filterVals, setFilterVals] = useState<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoaded(false);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (sort) { params.set('sort', sort); params.set('order', sortDir); }
      const tab = view.statusTabs?.find((t) => t.id === activeTab);
      if (tab) {
        for (const [k, v] of Object.entries(tab.filter)) {
          if (v) params.set(k, String(v));
        }
      }
      // apiPath may already carry a query string (e.g. /api/v1/documents?type=Invoice)
      // — append with & in that case, never a second ? (which corrupts the type).
      const sep = view.apiPath.includes('?') ? '&' : '?';
      const res = await fetch(`${view.apiPath}${sep}${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setRows(json.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoaded(true);
    }
  }, [view.apiPath, q, sort, sortDir, activeTab, view.statusTabs, nonce]);

  useEffect(() => { void load(); }, [load]);

  const visibleColumns = view.columns.filter((c) => c.defaultVisible !== false);

  const displayRows = rows.filter((row) => {
    for (const f of view.filters || []) {
      if (f.kind === 'date_range') {
        const from = filterVals[`${f.id}:from`]; const to = filterVals[`${f.id}:to`];
        if (!from && !to) continue;
        const dateCol = view.columns.find((c) => c.kind === 'date');
        const v = String((dateCol ? row[dateCol.id] : '') || '').slice(0, 10);
        if (from && v < from) return false;
        if (to && v > to) return false;
      } else {
        const val = filterVals[f.id];
        if (!val) continue;
        const field = f.kind === 'party' ? (view.columns.find((c) => c.kind === 'party')?.id || 'party_name') : f.id;
        if (!String(row[field] ?? '').toLowerCase().includes(val.toLowerCase())) return false;
      }
    }
    return true;
  });

  // Bulk actions that actually execute. send/remind go through the
  // document send route (acct_send_invoice enqueues the mail — the
  // toast says "queued", never "sent"); export downloads a CSV of the
  // selection; print prints. Actions with no real path are not
  // rendered instead of toasting.
  const bulkHandlers: Record<string, () => void> = {
    export: () => {
      const sel = displayRows.filter((r) => selected.has(String(r.id)));
      exportToCsv(sel as Record<string, unknown>[], visibleColumns.map((c) => ({ key: c.id, label: c.label })), `${view.id}-selected`);
      onToast?.(`Exported ${sel.length} rows to CSV`);
    },
    print: () => { if (typeof window !== 'undefined') window.print(); },
  };
  if (view.documentType) {
    const sendSelected = async (remind: boolean) => {
      const ids = [...selected];
      let ok = 0;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/v1/documents/${id}/send?type=${view.documentType!.toLowerCase()}${remind ? '&remind=1' : ''}`, { method: 'POST' });
          if (res.ok) ok++;
        } catch { /* counted below */ }
      }
      onToast?.(ok ? `${remind ? 'Reminders' : 'Send'} queued for ${ok} of ${ids.length} — mail lands via the outbox` : 'Send failed for the selected rows');
      setSelected(new Set());
    };
    bulkHandlers.send = () => void sendSelected(false);
    bulkHandlers.remind = () => void sendSelected(true);
  }

  const importCsv = async (file: File) => {
    const { ok, failed } = await importCsvFile(file, view.columns, view.apiPath);
    if (ok === 0 && failed === 0) { onToast?.('That CSV has no data rows'); return; }
    onToast?.(`Import finished — ${ok} created${failed ? `, ${failed} failed` : ''}`);
    setNonce((n) => n + 1);
  };

  const toggleSort = (colId: string) => {
    if (sort === colId) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSort(colId); setSortDir('asc'); } // third click = unsort → back to default
    } else {
      setSort(colId);
      setSortDir('asc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === displayRows.length) setSelected(new Set());
    else setSelected(new Set(displayRows.map((r) => String(r.id))));
  };

  const renderCell = (row: Record<string, unknown>, col: typeof view.columns[number]) => {
    const val = row[col.id];
    if (col.kind === 'money') {
      const n = Number(val) || 0;
      return `$${n.toFixed(2)}`;
    }
    if (col.kind === 'date') {
      const s = String(val || '');
      return s ? s.slice(0, 10) : '—';
    }
    if (col.kind === 'status') {
      const label = String(val || '');
      return <Pill pill={{ type: 'status', label }} />;
    }
    if (col.kind === 'party') {
      const name = String(val || '');
      if (!name || name === 'null') return '—';
      return <Pill pill={{ type: 'party', label: name }} />;
    }
    if (col.kind === 'pill') {
      const label = String(val || '');
      if (!label || label === 'null') return '—';
      return <Pill pill={{ type: 'tag', label }} />;
    }
    if (col.kind === 'count') {
      return String(val ?? '0');
    }
    if (col.kind === 'image') {
      const url = String(val || '');
      return url ? <img src={url} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-surface-container" />;
    }
    return String(val ?? '—');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status tabs */}
      {view.statusTabs && view.statusTabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-surface-dim px-4 mb-3">
          {view.statusTabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-3 py-2 text-[13px] font-semibold border-b-2 ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => { setActiveTab(tab.id); setSelected(new Set()); }}
            >
              {tab.label}
              {tab.count != null && <span className="ml-1 text-[11px] text-on-surface-variant">({tab.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 px-4">
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-on-surface">{selected.size} selected</span>
              {view.bulkActions?.filter((a) => bulkHandlers[a]).map((action) => (
                <button key={action} className="h-7 px-2 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => bulkHandlers[action]()}>
                  {action.replace(/_/g, ' ')}
                </button>
              ))}
              <button className="h-7 px-2 text-[12px] text-on-surface-variant hover:text-on-surface" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 px-3 border border-surface-dim rounded text-[13px] w-48"
              />
              {view.supportsImport && !view.documentType && (
                <>
                  <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCsv(f); }} />
                  <button className="h-8 px-3 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => importRef.current?.click()}>Import</button>
                </>
              )}
              {view.supportsExport && <button className="h-8 px-3 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => { exportToCsv(displayRows as Record<string, unknown>[], visibleColumns.map((c) => ({ key: c.id, label: c.label })), view.id); onToast?.(`Exported ${displayRows.length} rows to CSV`); }}>Export</button>}
            </>
          )}
        </div>
        <button className="text-[12px] text-on-surface-variant hover:text-on-surface" onClick={() => setNonce((n) => n + 1)}>↻ Refresh</button>
      </div>

      {/* Column filters (view.filters) */}
      {view.filters && view.filters.length > 0 && (
        <div className="flex items-center gap-2 px-4 mb-3 flex-wrap">
          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">filter_list</span>
          {view.filters.map((f) => (
            f.kind === 'date_range' ? (
              <span key={f.id} className="flex items-center gap-1 text-[12px] text-on-surface-variant">
                {f.label}
                <input type="date" className="h-7 px-1 border border-surface-dim rounded text-[12px]" value={filterVals[`${f.id}:from`] || ''} onChange={(e) => setFilterVals((p) => ({ ...p, [`${f.id}:from`]: e.target.value }))} />
                →
                <input type="date" className="h-7 px-1 border border-surface-dim rounded text-[12px]" value={filterVals[`${f.id}:to`] || ''} onChange={(e) => setFilterVals((p) => ({ ...p, [`${f.id}:to`]: e.target.value }))} />
              </span>
            ) : f.kind === 'select' && f.options ? (
              <select key={f.id} className="h-7 px-1 border border-surface-dim rounded text-[12px]" value={filterVals[f.id] || ''} onChange={(e) => setFilterVals((p) => ({ ...p, [f.id]: e.target.value }))} aria-label={f.label}>
                <option value="">{f.label}: all</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input key={f.id} type="text" placeholder={f.label} className="h-7 px-2 border border-surface-dim rounded text-[12px] w-32" value={filterVals[f.id] || ''} onChange={(e) => setFilterVals((p) => ({ ...p, [f.id]: e.target.value }))} />
            )
          ))}
          {Object.values(filterVals).some(Boolean) && (
            <button className="text-[12px] text-on-surface-variant hover:text-on-surface" onClick={() => setFilterVals({})}>Clear filters</button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white border border-surface-dim rounded-xl">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" checked={selected.size === displayRows.length && displayRows.length > 0} onChange={selectAll} className="accent-primary" /></th>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={`px-3 py-2 ${col.sortable ? 'cursor-pointer hover:bg-surface-container-low' : ''} ${col.align === 'right' ? 'text-right' : ''}`}
                  onClick={() => col.sortable && toggleSort(col.id)}
                >
                  {col.label}
                  {sort === col.id && <span className="ml-1 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {!loaded && (
              <tr><td colSpan={visibleColumns.length + 2} className="text-center py-8 text-on-surface-variant">Loading…</td></tr>
            )}
            {loaded && error && (
              <tr><td colSpan={visibleColumns.length + 2} className="text-center py-8 text-error">Error: {error}</td></tr>
            )}
            {loaded && !error && displayRows.length === 0 && (
              <tr><td colSpan={visibleColumns.length + 2} className="text-center py-12 text-on-surface-variant">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">inbox</span>
                  <div className="font-semibold text-[14px] text-on-surface">No {view.title.toLowerCase()} found</div>
                </div>
              </td></tr>
            )}
            {loaded && !error && displayRows.map((row) => {
              const id = String(row.id);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  className={`hover:bg-surface-container-low cursor-pointer ${isSelected ? 'bg-primary-container/30' : ''}`}
                  onClick={() => onRowOpen?.(id)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: id }); }}
                >
                  <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); toggleSelect(id); }}>
                    <input type="checkbox" checked={isSelected} className="accent-primary" readOnly />
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.id} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                      {renderCell(row, col)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: id }); }}>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals footer */}
      {view.totalsFooter && view.totalsFooter.length > 0 && displayRows.length > 0 && (
        <div className="flex justify-end gap-6 px-4 py-2 border-t border-surface-dim text-[12px] text-on-surface-variant">
          {view.totalsFooter.map((expr) => {
            const [, field] = expr.split(':');
            const sum = displayRows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
            return <span key={expr}><strong>Total {field.replace(/_/g, ' ')}:</strong> ${sum.toFixed(2)}</span>;
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entity={view.entity}
          rowId={contextMenu.rowId}
          onClose={() => setContextMenu(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

export default TableShell;
