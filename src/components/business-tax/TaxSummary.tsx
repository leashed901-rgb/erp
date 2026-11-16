'use client';
import './business-tax.css';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BusinessTaxScreenProps } from './types';

/* ═══════════════════════════════════════════════════════════════
   Deployed 1:1 from upload/Tax summary.html
   Every row, badge, menu, drawer and handler below is a direct
   port of the original mockup's markup + inline script.
   ═══════════════════════════════════════════════════════════════ */

type RowType = 'section' | 'data' | 'total' | 'final';
type RowCategory = 'income' | 'deductions' | 'assets';
type RowKind = 'mapped' | 'unmapped';
type TabKey = 'all' | 'income' | 'deductions' | 'assets' | 'unmapped';
type MappedFilter = '' | 'mapped' | 'unmapped';

interface TaxRowData {
  id: string;
  type: RowType;
  sectionId?: string;
  name: string;
  formLine?: string;
  amount?: string;
  ytd?: string;
  category?: RowCategory;
  kind?: RowKind;
  mapping?: string;
  accountId?: string;
}

interface TaxCategory {
  id: string;
  code: string;
  name: string;
  description: string;
}

const parseMoney = (s?: string) => parseFloat(String(s || '0').replace(/[$,\s]/g, '')) || 0;

import { exportToCsv } from '@/lib/csvExport';
import { TAX_NAV } from './types';

export default function TaxSummary({ onNavigate }: BusinessTaxScreenProps) {
  // Live rows from /api/tax/summary — GL accounts with journal activity,
  // grouped into Income / COGS / Operating / Assets with their mapping.
  const [rows, setRows] = useState<TaxRowData[]>([]);
  const [categories, setCategories] = useState<TaxCategory[]>([]);
  const [meta, setMeta] = useState<{
    mappable: number;
    mapped: number;
    unmappedCount: number;
    taxableProfit: { period: number; ytd: number };
  }>({ mappable: 0, mapped: 0, unmappedCount: 0, taxableProfit: { period: 0, ytd: 0 } });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [filterText, setFilterText] = useState('');
  const [filterMapped, setFilterMapped] = useState<MappedFilter>('');
  const [year, setYear] = useState('2026');

  const loadSummary = useCallback((y: string) => {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/tax/summary?year=${y}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(String(json.error.message || 'Failed to load tax summary'));
        setRows((json.data || []) as TaxRowData[]);
        setCategories(((json.meta || {}).categories || []) as TaxCategory[]);
        setMeta({
          mappable: Number(json.meta?.mappable ?? 0),
          mapped: Number(json.meta?.mapped ?? 0),
          unmappedCount: Number(json.meta?.unmappedCount ?? 0),
          taxableProfit: {
            period: Number(json.meta?.taxableProfit?.period ?? 0),
            ytd: Number(json.meta?.taxableProfit?.ytd ?? 0),
          },
        });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load tax summary.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSummary(year);
  }, [year, loadSummary]);

  /* Row menu — position:fixed, anchored exactly like the original math */
  const [rowMenu, setRowMenu] = useState<{ top: number; left: number; rowId: string } | null>(null);

  /* Map drawer */
  const [mapOpen, setMapOpen] = useState(false);
  const [mapRowId, setMapRowId] = useState<string | null>(null);
  const [mapLine, setMapLine] = useState('');

  /* Local toast — exact mockup toast (bottom center, 1.8s) */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── Filtering — port of applyFilters() ─────────────────────── */
  const firstPass = (row: TaxRowData, q: string): boolean => {
    let visible = true;
    const nameText = (row.name + (row.formLine || '')).toLowerCase();
    const trKind = row.type === 'data' ? row.kind! : '';
    const trCat = row.category || '';
    if (q && !nameText.includes(q)) visible = false;
    if (filterMapped === 'mapped' && trKind !== 'mapped') visible = false;
    if (filterMapped === 'unmapped' && trKind !== 'unmapped') visible = false;
    if (activeTab === 'unmapped' && trKind !== 'unmapped') visible = false;
    if (activeTab === 'income' && trCat !== 'income') visible = false;
    if (activeTab === 'deductions' && trCat !== 'deductions') visible = false;
    if (activeTab === 'assets' && trCat !== 'assets') visible = false;
    return visible;
  };

  const { visibleIds, shown, total } = useMemo(() => {
    const q = (filterText || '').toLowerCase();
    const vis = new Set<string>();
    let shownCount = 0;
    let totalCount = 0;
    /* First pass over every non-section row */
    const first = new Map<string, boolean>();
    rows.forEach(r => {
      if (r.type === 'section') return;
      totalCount++;
      const v = firstPass(r, q);
      first.set(r.id, v);
      if (v) shownCount++;
      if (v) vis.add(r.id);
    });
    /* Sections: hide if empty; totals follow their section's anyVisible */
    rows.forEach(r => {
      if (r.type !== 'section') return;
      const anyVisible = rows.some(
        x => x.type === 'data' && x.sectionId === r.sectionId && first.get(x.id)
      );
      if (anyVisible) vis.add(r.id);
      rows.forEach(x => {
        if (x.type === 'total' && x.sectionId === r.sectionId && anyVisible) vis.add(x.id);
      });
    });
    return { visibleIds: vis, shown: shownCount, total: totalCount };
  }, [rows, filterText, filterMapped, activeTab]);

  /* ── Map drawer — persists the mapping on the account ──────── */
  const mapRow = rows.find(r => r.id === mapRowId) || null;
  const accountType =
    mapRow?.category === 'income' ? 'Income account'
    : mapRow?.category === 'assets' ? 'Asset account'
    : 'Expense account';

  const openMapDrawer = (row: TaxRowData) => {
    setMapRowId(row.id);
    const current = categories.find((c) => c.name === row.mapping);
    setMapLine(current ? current.id : '');
    setMapOpen(true);
  };
  const closeMapDrawer = () => {
    setMapOpen(false);
    setMapRowId(null);
  };

  const saveMapping = async (andNext: boolean) => {
    if (!mapLine) { toast('Select a tax line'); return; }
    const row = rows.find(r => r.id === mapRowId);
    if (!row?.accountId) { toast('No account on this row'); return; }
    const cat = categories.find((c) => c.id === mapLine);
    const res = await fetch(`/api/accounts/${row.accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tax_category_id: mapLine }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast(String(json?.error?.message || 'Could not save mapping'));
      return;
    }
    toast(`${row.name} mapped to "${cat?.name ?? mapLine}"`);
    loadSummary(year);
    if (andNext) {
      const next = rows.find(r => r.type === 'data' && r.kind === 'unmapped' && r.id !== row.id);
      if (next) { openMapDrawer(next); return; }
    }
    setMapOpen(false);
    setMapRowId(null);
  };

  /* ── Row ⋯ menu — port of the appended data-row-menu handler ── */
  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, row: TaxRowData) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const menuHeight = 300;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setRowMenu({
      rowId: row.id,
      top,
      left: Math.min(r.right - 240, window.innerWidth - 260),
    });
  };

  const runRowAction = async (act: string) => {
    const row = rows.find(r => r.id === rowMenu?.rowId);
    setRowMenu(null);
    if (!row) return;
    switch (act) {
      case 'remap':
        openMapDrawer(row); break;
      case 'view-register':
      case 'view-transactions':
        onNavigate(...TAX_NAV.coa());
        break;
      case 'run-report': {
        if (!row.accountId) break;
        const res = await fetch(`/api/accounts/${row.accountId}/register?from=${year}-01-01&to=${year}-12-31`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { toast('Could not load the register'); break; }
        exportToCsv((json.data || []) as Record<string, unknown>[], [
          { key: 'date', label: 'Date' },
          { key: 'source', label: 'Source' },
          { key: 'memo', label: 'Memo' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'balance', label: 'Balance' },
        ], `register-${row.name.replace(/\W+/g, '-').toLowerCase()}`);
        toast(`Register exported for ${row.name}`);
        break;
      }
      case 'export-line':
        exportToCsv([row as unknown as Record<string, unknown>], [
          { key: 'name', label: 'Account' },
          { key: 'formLine', label: 'Tax line' },
          { key: 'amount', label: 'Amount' },
          { key: 'ytd', label: 'YTD' },
          { key: 'mapping', label: 'Mapping' },
        ], `tax-line-${row.name.replace(/\W+/g, '-').toLowerCase()}`);
        toast(`Exported line: ${row.name}`);
        break;
    }
  };

  /* ── Export — CSV of the visible rows (the only export the app has) ─ */
  const runExport = () => {
    const visible = rows.filter((r) => visibleIds.has(r.id));
    exportToCsv(visible as unknown as Record<string, unknown>[], [
      { key: 'name', label: 'Account / Tax line' },
      { key: 'formLine', label: 'Form line' },
      { key: 'amount', label: 'Amount' },
      { key: 'ytd', label: 'YTD' },
      { key: 'mapping', label: 'Mapping' },
    ], `tax-summary-${year}`);
    toast(`Exported ${visible.length} rows to CSV`);
  };

  /* ── Global click — closes the row menu ─────────────────────── */
  useEffect(() => {
    if (!rowMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (rowMenu && !t.closest('#row-menu')) setRowMenu(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [rowMenu]);

  /* ── Mapping counts come from the summary meta ───────────────── */
  const unmappedCount = meta.unmappedCount;
  const mappedCount = meta.mapped;
  const grossIncomeYtd = useMemo(() => {
    const t = rows.find((r) => r.id === 't-sec-income');
    return t ? parseMoney(t.ytd) : 0;
  }, [rows]);
  const deductionsYtd = useMemo(() => {
    const cogs = rows.find((r) => r.id === 't-sec-cogs');
    const op = rows.find((r) => r.id === 't-sec-operating');
    return (cogs ? parseMoney(cogs.ytd) : 0) + (op ? parseMoney(op.ytd) : 0);
  }, [rows]);

  return (
    <div className="tax-summary-page">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Business Tax</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Tax summary</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Tax summary</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Tax year 2026 · Unsaid · Accrual basis</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-label-sm text-on-surface-variant">Tax year</span>
              <select
                className="h-8 px-2 border border-surface-dim rounded text-body-sm bg-white"
                value={year}
                onChange={e => setYear(e.target.value)}
              >
                <option>2026</option>
                <option>2025</option>
                <option>2024</option>
              </select>
            </div>
            <div className="flex split-btn">
              <button
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={runExport}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>Export CSV
              </button>
            </div>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => window.print()}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>Print
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="kpi-card">
            <div className="kpi-label">Gross income</div>
            <div className="kpi-val">{loading ? '…' : `$${grossIncomeYtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">YTD · accrual</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Deductions</div>
            <div className="kpi-val">{loading ? '…' : `$${deductionsYtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">COGS + operating</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Taxable profit</div>
            <div className="kpi-val text-qb-blue">{loading ? '…' : `$${meta.taxableProfit.ytd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">Before estimated tax</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Mapping health</div>
            <div className="kpi-val"><span>{mappedCount}</span> / {meta.mappable}</div>
            {unmappedCount === 0 ? (
              <div className="text-[11px] text-secondary mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>All accounts mapped
              </div>
            ) : (
              <div className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">warning</span>{unmappedCount} account{unmappedCount !== 1 ? 's' : ''} unmapped
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3 border-b border-surface-dim overflow-x-auto">
          {([['all', 'All'], ['income', 'Income by category'], ['deductions', 'Deductions'], ['assets', 'Business assets'], ['unmapped', 'Unmapped only']] as [TabKey, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-2 text-label-md tab-underline${activeTab === key ? ' active' : ' text-on-surface-variant'}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="w-full h-7 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Filter accounts…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </div>
          <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">tune</span>
            <span className="text-on-surface-variant">Show:</span>
            <select
              className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              value={filterMapped}
              onChange={e => setFilterMapped(e.target.value as MappedFilter)}
            >
              <option value="">All</option>
              <option value="mapped">Mapped only</option>
              <option value="unmapped">Unmapped only</option>
            </select>
          </label>
          <div className="flex-1"></div>
          <span className="text-[11px] text-on-surface-variant">{shown} of {total}</span>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden max-h-[640px] overflow-y-auto">
          <table className="tax-table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Account / Tax line</th>
                <th className="right" style={{ width: '14%' }}>Amount</th>
                <th className="right" style={{ width: '14%' }}>YTD</th>
                <th style={{ width: '22%' }}>Tax mapping</th>
                <th style={{ width: '14%' }}></th>
              </tr>
            </thead>
            <tbody data-tax-tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ padding: 16 }} className="text-on-surface-variant">Loading tax summary…</td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={5} style={{ padding: 16 }}>
                    {loadError}{' '}
                    <button type="button" className="text-primary font-semibold" onClick={() => loadSummary(year)}>Retry</button>
                  </td>
                </tr>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16 }} className="text-on-surface-variant">No accounts with activity in {year}.</td>
                </tr>
              )}
              {rows.map(row => {
                if (!visibleIds.has(row.id)) return null;

                if (row.type === 'section') {
                  return (
                    <tr className="section" key={row.id} data-section={row.sectionId}>
                      <td colSpan={5}>{row.name}</td>
                    </tr>
                  );
                }

                if (row.type === 'total') {
                  return (
                    <tr className="total" key={row.id}>
                      <td>{row.name}</td>
                      <td className="right">{row.amount}</td>
                      <td className="right">{row.ytd}</td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                }

                if (row.type === 'final') {
                  return (
                    <tr className="final" key={row.id}>
                      <td>{row.name}</td>
                      <td className="right">{row.amount}</td>
                      <td className="right">{row.ytd}</td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                }

                /* Data row */
                const unmapped = row.kind === 'unmapped';
                return (
                  <tr
                    key={row.id}
                    className={`clickable${unmapped ? ' unmapped' : ''}`}
                    data-kind={row.kind}
                    data-category={row.category}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button, select, a')) return;
                      openMapDrawer(row);
                    }}
                  >
                    <td>{row.name}<div className="text-[11px] text-on-surface-variant">{row.formLine}</div></td>
                    <td className="right">{row.amount}</td>
                    <td className="right">{row.ytd}</td>
                    <td>
                      <span className={`mapping-badge ${unmapped ? 'unmapped' : 'mapped'}`}>
                        <span className="material-symbols-outlined text-[11px]">{unmapped ? 'error' : 'check_circle'}</span>
                        {unmapped ? 'Unmapped' : row.mapping}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="text-[11px] font-semibold text-primary hover:underline"
                        data-remap={row.name}
                        onClick={() => openMapDrawer(row)}
                      >
                        {unmapped ? 'Map now' : 'Remap'}
                      </button>
                      <button
                        className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-surface-container"
                        aria-label="Account actions"
                        onClick={e => openRowMenu(e, row)}
                      >
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">more_horiz</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="mapping-badge mapped text-[10px]!">
              <span className="material-symbols-outlined text-[10px]">check_circle</span>Mapped
            </span>
            Account is mapped to a tax line
          </span>
          <span className="flex items-center gap-1">
            <span className="mapping-badge unmapped text-[10px]!">
              <span className="material-symbols-outlined text-[10px]">error</span>Unmapped
            </span>
            Requires mapping before filing
          </span>
        </div>
      </main>

      {/* ═══════════ MAPPING DRAWER ═══════════ */}
      <div className={mapOpen ? 'drawer-scrim open' : 'drawer-scrim'} onClick={closeMapDrawer}></div>
      <div className={mapOpen ? 'drawer open' : 'drawer'}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">Map tax line</div>
              <div className="text-[11px] text-on-surface-variant">Tax line mapping</div>
            </div>
          </div>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeMapDrawer}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3">
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Account</div>
            <div className="text-headline-sm mt-1">{mapRow ? mapRow.name : '—'}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{mapRow ? accountType : '—'}</div>
          </div>

          <div>
            <label className="field-label">Form 1120 tax line</label>
            <select className="field-input" value={mapLine} onChange={e => setMapLine(e.target.value)}>
              <option value="">— Select tax line —</option>
              <optgroup label="Income">
                {categories.filter((c) => ['GROSS_RECEIPTS', 'RETURNS', 'OTHER_INCOME'].includes(c.code)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Deductions">
                {categories.filter((c) => ['COGS', 'CONTRACT_LABOR', 'ADVERTISING', 'OFFICE', 'SHIPPING', 'UTILITIES', 'RENT', 'OTHER_DEDUCTIONS'].includes(c.code)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Assets">
                {categories.filter((c) => ['SEC179', 'MACRS5'].includes(c.code)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="bg-qb-blue/5 border border-qb-blue/30 rounded-lg p-3 text-[11px] text-qb-blue flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
            <div>Mapping is reversible. Unmapped accounts are excluded from tax estimates and flagged on filing.</div>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeMapDrawer}>Cancel</button>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={() => saveMapping(true)}>Save and next</button>
              <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={() => saveMapping(false)}>Save mapping</button>
              <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      {rowMenu && (
        <div id="row-menu" className="menu open" style={{ top: rowMenu.top, left: rowMenu.left }}>
          <div className="menu-header">This account</div>
          <button onClick={() => runRowAction('remap')}><span className="material-symbols-outlined">tune</span>Remap tax line</button>
          <button onClick={() => runRowAction('view-register')}><span className="material-symbols-outlined">receipt_long</span>View register</button>
          <button onClick={() => runRowAction('run-report')}><span className="material-symbols-outlined">assessment</span>Run report for account</button>
          <div className="sep"></div>
          <div className="menu-header">Drill down</div>
          <button onClick={() => runRowAction('view-transactions')}><span className="material-symbols-outlined">list</span>View transactions</button>
          <button onClick={() => runRowAction('export-line')}><span className="material-symbols-outlined">download</span>Export this line</button>
        </div>
      )}

      <div className={toastMsg ? 'toast show' : 'toast'}>{toastMsg}</div>
    </div>
  );
}
