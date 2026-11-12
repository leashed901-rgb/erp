'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ViewDef } from '@/lib/contracts';
import { Pill } from './Pill';
import { ContextMenu } from './ContextMenu';

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
      const res = await fetch(`${view.apiPath}?${params.toString()}`);
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
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => String(r.id))));
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
              {view.bulkActions?.map((action) => (
                <button key={action} className="h-7 px-2 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => onToast?.(`${action} (bulk — ${selected.size} selected)`)}>
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
              {view.supportsImport && <button className="h-8 px-3 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => onToast?.('Import hub')}>Import</button>}
              {view.supportsExport && <button className="h-8 px-3 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => onToast?.('Export')}>Export</button>}
            </>
          )}
        </div>
        <button className="text-[12px] text-on-surface-variant hover:text-on-surface" onClick={() => setNonce((n) => n + 1)}>↻ Refresh</button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white border border-surface-dim rounded-xl">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={selectAll} className="accent-primary" /></th>
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
            {loaded && !error && rows.length === 0 && (
              <tr><td colSpan={visibleColumns.length + 2} className="text-center py-12 text-on-surface-variant">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">inbox</span>
                  <div className="font-semibold text-[14px] text-on-surface">No {view.title.toLowerCase()} found</div>
                </div>
              </td></tr>
            )}
            {loaded && !error && rows.map((row) => {
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
      {view.totalsFooter && view.totalsFooter.length > 0 && rows.length > 0 && (
        <div className="flex justify-end gap-6 px-4 py-2 border-t border-surface-dim text-[12px] text-on-surface-variant">
          {view.totalsFooter.map((expr) => {
            const [, field] = expr.split(':');
            const sum = rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
            return <span key={expr}><strong>Total {field}:</strong> ${sum.toFixed(2)}</span>;
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
