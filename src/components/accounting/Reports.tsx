'use client';
import './reports.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { AccountingScreenProps } from './types';
import { fetchReport, useSavedReportViews, reportViewMutations } from '@/hooks/useAccountingApi';
import { exportToCsv } from '@/lib/csvExport';
import type { ReportDto, SavedViewDto } from '@/lib/acctTypes';

/* Report rows are computed live by /api/accounting/reports/[id]
   from the posted general ledger + AR/AP/tax subledgers. */

type ReportRow = ReportDto['rows'][number];

/* ── Library cards (data-report / data-category / data-title) ── */

interface ReportCardDef {
  id: string;
  category: string;
  dataTitle: string;
  title: string;
  sub: string;
  icon: string;
  iconBg: string;
  desc: string;
}

const REPORT_CARDS: ReportCardDef[] = [
  { id: 'pnl', category: 'financial', dataTitle: 'Profit and Loss', title: 'Profit and Loss', sub: 'Income and expenses', icon: 'trending_up', iconBg: 'bg-qb-blue', desc: 'Revenue minus costs, broken down by account.' },
  { id: 'bs', category: 'financial', dataTitle: 'Balance Sheet', title: 'Balance Sheet', sub: 'Assets = Liabilities + Equity', icon: 'balance', iconBg: 'bg-qb-teal', desc: 'Snapshot of what you own, owe, and are worth.' },
  { id: 'cashflow', category: 'financial', dataTitle: 'Statement of Cash Flows', title: 'Statement of Cash Flows', sub: 'Operating / investing / financing', icon: 'waterfall_chart', iconBg: 'bg-qb-green', desc: 'Where cash came from and where it went.' },
  { id: 'araging', category: 'sales', dataTitle: 'A/R Aging Summary', title: 'A/R Aging Summary', sub: 'Who owes you, and how long', icon: 'hourglass_top', iconBg: 'bg-qb-maroon', desc: 'Outstanding invoices by aging bucket.' },
  { id: 'salesbycustomer', category: 'sales', dataTitle: 'Sales by Customer Summary', title: 'Sales by Customer', sub: 'Ranked by revenue', icon: 'groups', iconBg: 'bg-qb-navy', desc: 'Revenue per customer for the period.' },
  { id: 'expensesbyvendor', category: 'expenses', dataTitle: 'Expenses by Vendor Summary', title: 'Expenses by Vendor', sub: 'Where money went', icon: 'receipt_long', iconBg: 'bg-qb-maroon', desc: 'Spend per vendor for the period.' },
  { id: 'gl', category: 'accounting', dataTitle: 'General Ledger', title: 'General Ledger', sub: 'Every posted transaction', icon: 'menu_book', iconBg: 'bg-qb-blue', desc: 'All account activity for the period.' },
  { id: 'tb', category: 'accounting', dataTitle: 'Trial Balance', title: 'Trial Balance', sub: 'Debits = Credits', icon: 'rule', iconBg: 'bg-qb-teal', desc: 'Account balances at a point in time.' },
  { id: 'salestax', category: 'tax', dataTitle: 'Sales Tax Liability', title: 'Sales Tax Liability', sub: 'What you owe the state', icon: 'gavel', iconBg: 'bg-qb-green', desc: 'Sales tax collected minus paid.' },
];

/* ── Customize drawer: column list (drag to reorder, toggle to show/hide) ── */

interface ColItem {
  col: string;
  label: string;
  checked: boolean;
}

type CustTab = 'data' | 'visual' | 'saved';

/* Current-month defaults + preset ranges, computed from the real clock */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthBounds = (d: Date) => ({
  from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
  to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
});
const NOW = new Date();
const THIS_MONTH = monthBounds(NOW);

export default function Reports({}: AccountingScreenProps) {
  /* Toast (mockup-local, 1800ms) */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /* Library: filter + open */
  const [view, setView] = useState<'library' | 'viewer'>('library');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [rptTab, setRptTab] = useState('all');

  /* Viewer: title / range text (two DOM spots, synced like the script) */
  const [viewerSub, setViewerSub] = useState('');
  const [reportRange, setReportRange] = useState('');

  /* Date range */
  const [rangeFrom, setRangeFrom] = useState(THIS_MONTH.from);
  const [rangeTo, setRangeTo] = useState(THIS_MONTH.to);
  const [rangePreset, setRangePreset] = useState('Custom');

  /* Live report data + saved views */
  const [reportData, setReportData] = useState<ReportDto | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const { views: savedViews, refresh: refreshViews } = useSavedReportViews();

  /* Customize drawer state */
  const [custOpen, setCustOpen] = useState(false);
  const [custTab, setCustTab] = useState<CustTab>('data');
  const [cols, setCols] = useState<ColItem[]>([]);
  const [rowsSel, setRowsSel] = useState('All rows');
  const [filterExcludeZero, setFilterExcludeZero] = useState(false);
  const [filterComparePrior, setFilterComparePrior] = useState(false);
  const [filterShowPct, setFilterShowPct] = useState(false);
  const [numFormat, setNumFormat] = useState('dollars');
  const [negFormat, setNegFormat] = useState('red');
  const [decimals, setDecimals] = useState('2');
  const [divideThousands, setDivideThousands] = useState(false);
  const [highlightNeg, setHighlightNeg] = useState(true);
  const [highlightCompare, setHighlightCompare] = useState(false);
  const [saveName, setSaveName] = useState('');

  /* Column drag reorder */
  const dragSrc = useRef<string | null>(null);
  const [draggingCol, setDraggingCol] = useState<string | null>(null);

  const currentReport = reportData && reportData.id === currentReportId ? reportData : null;
  const activeTitle = currentReport ? currentReport.title : (REPORT_CARDS.find((c) => c.id === currentReportId)?.title ?? 'Report');
  const breadcrumb = view === 'viewer' ? activeTitle : 'Reports';

  /* VIEWER: open a report — the effect below fetches it live */
  const openReport = (id: string) => {
    setCurrentReportId(id);
    setView('viewer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Fetch (and refetch on range / compare / pct change) */
  useEffect(() => {
    if (view !== 'viewer' || !currentReportId) return;
    let alive = true;
    setReportLoading(true);
    (async () => {
      const res = await fetchReport(currentReportId, {
        from: rangeFrom,
        to: rangeTo,
        compare: filterComparePrior,
        pct: filterShowPct,
      });
      if (!alive) return;
      setReportLoading(false);
      if (res.ok && res.data) {
        setReportData(res.data);
        setViewerSub(res.data.range);
        setReportRange(res.data.range);
        setCols((prev) => {
          const prevChecked = new Map(prev.map((c) => [c.col, c.checked]));
          return res.data!.columns.map((label, i) => ({
            col: `c${i}`,
            label: label || 'Account',
            checked: prevChecked.get(`c${i}`) ?? true,
          }));
        });
      } else {
        toast(res.error || 'Report failed to load');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentReportId, rangeFrom, rangeTo, filterComparePrior, filterShowPct]);

  /* Visual number formatting applied to money cells at render */
  const fmtCell = (v: string): string => {
    const m = /^(−?)\$([\d,]+\.\d{2})$/.exec(v);
    if (!m) return v;
    let n = parseFloat(m[2].replace(/,/g, ''));
    if (m[1]) n = -n;
    if (divideThousands) n = n / 1000;
    if (numFormat === 'thousands') {
      const abs = Math.abs(n);
      const body = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0);
      return `${n < 0 ? '−' : ''}$${body}`;
    }
    const dp = numFormat === 'no-cents' ? 0 : parseInt(decimals, 10);
    return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  /* Negative-value formatting (red / paren), minus sign is U+2212 */
  const formatNeg = (v: string) => {
    const disp = fmtCell(v);
    if (!disp || disp === '—' || disp === '') return disp;
    if (highlightNeg && negFormat === 'red' && disp.startsWith('−')) return <span className="num-neg">{disp}</span>;
    if (negFormat === 'paren' && disp.startsWith('−')) return <span className="num-neg">{`(${disp.slice(1)})`}</span>;
    return disp;
  };

  /* Date range preset — computed from the real clock */
  const handlePresetChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const preset = e.target.value;
    setRangePreset(preset);
    const now = new Date();
    let nextFrom = rangeFrom;
    let nextTo = rangeTo;
    if (preset === 'This month') {
      const b = monthBounds(now);
      nextFrom = b.from;
      nextTo = b.to;
    }
    if (preset === 'Last month') {
      const b = monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      nextFrom = b.from;
      nextTo = b.to;
    }
    if (preset === 'This quarter') {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      nextFrom = iso(qStart);
      nextTo = iso(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0));
    }
    if (preset === 'This year') {
      nextFrom = `${now.getFullYear()}-01-01`;
      nextTo = `${now.getFullYear()}-12-31`;
    }
    if (preset === 'Last year') {
      nextFrom = `${now.getFullYear() - 1}-01-01`;
      nextTo = `${now.getFullYear() - 1}-12-31`;
    }
    setRangeFrom(nextFrom);
    setRangeTo(nextTo);
  };

  const handleFromChange = (e: ChangeEvent<HTMLInputElement>) => setRangeFrom(e.target.value);
  const handleToChange = (e: ChangeEvent<HTMLInputElement>) => setRangeTo(e.target.value);

  /* Column drag reorder */
  const handleColDragStart = (col: string) => {
    dragSrc.current = col;
    setDraggingCol(col);
  };
  const handleColDragEnd = () => {
    setDraggingCol(null);
    dragSrc.current = null;
  };
  const handleColDragOver = (e: DragEvent<HTMLDivElement>, item: ColItem) => {
    e.preventDefault();
    if (!dragSrc.current || dragSrc.current === item.col) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    setCols(prev => {
      const moved = prev.find(c => c.col === dragSrc.current);
      if (!moved) return prev;
      const rest = prev.filter(c => c !== moved);
      let insertAt = rest.indexOf(item);
      if (insertAt === -1) return prev;
      if (after) insertAt += 1;
      rest.splice(insertAt, 0, moved);
      return rest;
    });
  };
  const toggleCol = (col: string) => {
    setCols(prev => prev.map(c => (c.col === col ? { ...c, checked: !c.checked } : c)));
  };

  /* Save view — persists to acct_report_snapshots via the API */
  const handleSaveView = async () => {
    const name = saveName.trim();
    if (!name) { toast('Name required'); return; }
    if (!currentReportId) { toast('Open a report first'); return; }
    const res = await reportViewMutations.save({
      name,
      from: rangeFrom,
      to: rangeTo,
      config: {
        reportId: currentReportId,
        cols,
        rowsSel,
        filterExcludeZero,
        filterComparePrior,
        filterShowPct,
        numFormat,
        negFormat,
        decimals,
        divideThousands,
        highlightNeg,
        highlightCompare,
      },
    });
    if (res.ok) {
      toast(`Saved view "${name}"`);
      setSaveName('');
      await refreshViews();
    } else toast(res.error || 'View could not be saved');
  };

  /* Restore a saved view: report, range and every customize option */
  const applySavedView = (v: SavedViewDto) => {
    const cfg = v.config || {};
    const reportId = typeof cfg.reportId === 'string' ? cfg.reportId : null;
    if (!reportId) { toast('This view has no report'); return; }
    if (Array.isArray(cfg.cols)) setCols(cfg.cols as ColItem[]);
    if (typeof cfg.rowsSel === 'string') setRowsSel(cfg.rowsSel);
    if (typeof cfg.filterExcludeZero === 'boolean') setFilterExcludeZero(cfg.filterExcludeZero);
    if (typeof cfg.filterComparePrior === 'boolean') setFilterComparePrior(cfg.filterComparePrior);
    if (typeof cfg.filterShowPct === 'boolean') setFilterShowPct(cfg.filterShowPct);
    if (typeof cfg.numFormat === 'string') setNumFormat(cfg.numFormat);
    if (typeof cfg.negFormat === 'string') setNegFormat(cfg.negFormat);
    if (typeof cfg.decimals === 'string') setDecimals(cfg.decimals);
    if (typeof cfg.divideThousands === 'boolean') setDivideThousands(cfg.divideThousands);
    if (typeof cfg.highlightNeg === 'boolean') setHighlightNeg(cfg.highlightNeg);
    if (typeof cfg.highlightCompare === 'boolean') setHighlightCompare(cfg.highlightCompare);
    setRangeFrom(v.from || rangeFrom);
    setRangeTo(v.to || rangeTo);
    setCustOpen(false);
    openReport(reportId);
    toast(`View "${v.name}" applied`);
  };

  /* Apply customization (report body re-renders from state automatically) */
  const handleApplyCust = () => {
    setCustOpen(false);
    toast('Customization applied');
  };

  /* Compare / % toggles are computed by the P&L endpoint */
  const handleCompareToggle = () => {
    if (!filterComparePrior && currentReportId !== 'pnl') {
      toast('Compare to prior period is available on Profit and Loss');
      return;
    }
    setFilterComparePrior((v) => !v);
  };
  const handlePctToggle = () => {
    if (!filterShowPct && currentReportId !== 'pnl') {
      toast('Percentages are available on Profit and Loss');
      return;
    }
    setFilterShowPct((v) => !v);
  };

  /* Export the visible report as CSV */
  const handleExport = () => {
    if (!currentReport) { toast('Nothing to export'); return; }
    const labels = currentReport.columns.map((c, i) => c || `Column ${i + 1}`);
    const rows = visibleRows.map((row) => {
      const obj: Record<string, string> = {};
      if (row.kind === 'total' || row.kind === 'final') {
        obj[labels[0]] = row.label || '';
        row.cells.forEach((c, i) => { obj[labels[i + 1]] = c; });
      } else {
        row.cells.forEach((c, i) => { obj[labels[i]] = c; });
      }
      return obj;
    });
    exportToCsv(rows, labels.map((l) => ({ key: l, label: l })), `${currentReport.id}-report.csv`);
    toast('Report exported as CSV');
  };

  /* Library filtering (search matches the card's semibold title, tab matches category) */
  const q = reportSearch.toLowerCase();
  const isCardVisible = (card: ReportCardDef) => {
    const matchQ = !q || card.title.toLowerCase().includes(q);
    const matchTab = rptTab === 'all' || card.category === rptTab;
    return matchQ && matchTab;
  };

  /* Row/column shaping from the customize state */
  const hideZero = rowsSel === 'Non-zero only' || filterExcludeZero;
  const visibleRows: ReportRow[] = (currentReport?.rows ?? []).filter((row) => {
    if (!hideZero || row.kind !== 'sub') return true;
    return row.cells.slice(1).some((c) => c !== '—' && c !== '' && c !== '$0.00');
  });
  const colIdx = (c: ColItem) => parseInt(c.col.slice(1), 10);
  const orderedCells = (row: ReportRow): { text: string; isCompare: boolean }[] => {
    if (!currentReport || cols.length === 0) return row.cells.map((text) => ({ text, isCompare: false }));
    const shown = cols.filter((c) => c.checked);
    const labelOf = (i: number) => currentReport.columns[i] || '';
    if (row.kind === 'total' || row.kind === 'final') {
      return shown
        .filter((c) => colIdx(c) > 0)
        .map((c) => ({ text: row.cells[colIdx(c) - 1] ?? '', isCompare: labelOf(colIdx(c)) === 'Prior period' }));
    }
    return shown.map((c) => ({ text: row.cells[colIdx(c)] ?? '', isCompare: labelOf(colIdx(c)) === 'Prior period' }));
  };

  return (
    <div className="reports-page bg-background font-sans text-body-md text-on-surface antialiased">

      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Accounting</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold" data-breadcrumb>{breadcrumb}</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 1 — REPORT LIBRARY                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <main id="library-view" className={view === 'library' ? 'px-6 pb-12' : 'px-6 pb-12 hidden-imp'}>

        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Reports</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Standard reports, custom reports, saved views.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              data-new-report
              onClick={() => toast('Start from a standard report, then Customize → Save as view')}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>Custom report</button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              data-saved-views
              onClick={() => { setCustTab('saved'); setCustOpen(true); }}
            >
              <span className="material-symbols-outlined text-[16px]">bookmark</span>Saved views</button>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex items-center max-w-lg mb-5">
          <span className="material-symbols-outlined absolute left-3 text-[16px] text-outline">search</span>
          <input
            className="w-full h-9 pl-9 pr-3 bg-white border border-surface-dim rounded-lg text-body-sm focus:outline-none focus:border-primary"
            placeholder="Search reports…"
            data-report-search
            value={reportSearch}
            onChange={e => setReportSearch(e.target.value)}
          />
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-surface-dim overflow-x-auto">
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'all' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="all" onClick={() => setRptTab('all')}>All</button>
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'financial' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="financial" onClick={() => setRptTab('financial')}>Financial statements</button>
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'sales' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="sales" onClick={() => setRptTab('sales')}>Sales & customers</button>
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'expenses' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="expenses" onClick={() => setRptTab('expenses')}>Expenses & vendors</button>
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'accounting' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="accounting" onClick={() => setRptTab('accounting')}>Accounting</button>
          <button className={`px-3 py-2 text-label-md tab-underline ${rptTab === 'tax' ? 'active' : 'text-on-surface-variant'}`} data-rpt-tab="tax" onClick={() => setRptTab('tax')}>Tax</button>
        </div>

        {/* Report grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-report-grid>

          {REPORT_CARDS.map(card => (
            <div
              key={card.id}
              className="report-card"
              data-report={card.id}
              data-category={card.category}
              data-title={card.dataTitle}
              style={{ display: isCardVisible(card) ? undefined : 'none' }}
              onClick={() => openReport(card.id)}
            >
              <div className="flex items-center gap-2">
                <div className={`icon-wrap ${card.iconBg}`}><span className="material-symbols-outlined text-[20px]">{card.icon}</span></div>
                <div>
                  <div className="text-body-md font-semibold">{card.title}</div>
                  <div className="text-[11px] text-on-surface-variant">{card.sub}</div>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant">{card.desc}</p>
            </div>
          ))}

        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 2 — REPORT VIEWER                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <main id="viewer-view" className={view === 'viewer' ? 'pb-12' : 'pb-12 hidden-imp'}>

        {/* Viewer header */}
        <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-surface-dim bg-white">
          <div className="flex items-center gap-3">
            <button
              className="h-8 w-8 rounded hover:bg-surface-container-low flex items-center justify-center"
              data-back
              aria-label="Back"
              onClick={() => setView('library')}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span></button>
            <div>
              <div className="text-headline-sm" data-viewer-title>{activeTitle}</div>
              <div className="text-[11px] text-on-surface-variant" data-viewer-sub>{viewerSub}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="date-range">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
              <input type="date" value={rangeFrom} data-range-from onChange={handleFromChange} />
              <span className="text-on-surface-variant text-[11px]">to</span>
              <input type="date" value={rangeTo} data-range-to onChange={handleToChange} />
              <select
                className="h-[30px] px-2 border border-surface-dim rounded text-[12px] bg-white"
                data-range-preset
                value={rangePreset}
                onChange={handlePresetChange}
              >
                <option>Custom</option>
                <option>This month</option>
                <option>Last month</option>
                <option>This quarter</option>
                <option>This year</option>
                <option>Last year</option>
              </select>
            </div>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              data-customize
              onClick={() => setCustOpen(true)}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>Customize</button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              data-export
              onClick={handleExport}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export ▾</button>
            <button
              className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
              data-print
              onClick={() => window.print()}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>Print</button>
          </div>
        </div>

        {/* Report body */}
        <div className="px-6 py-6">
          <div className="bg-white rounded-lg border border-surface-dim overflow-hidden max-w-5xl mx-auto">
            <div className="p-6 border-b border-surface-dim text-center">
              <div className="text-headline-md" data-report-company>Unsaid</div>
              <div className="text-headline-sm mt-1" data-report-title>{activeTitle}</div>
              <div className="text-body-sm text-on-surface-variant mt-1" data-report-range>{reportRange}</div>
              <div className="text-body-sm text-on-surface-variant">Accrual basis</div>
            </div>

            <table className="w-full rpt-table" data-report-body>
              <tbody>
                {reportLoading && (
                  <tr className="sub"><td className="px-4 py-4 text-on-surface-variant">Computing from the general ledger…</td></tr>
                )}
                {!reportLoading && currentReport && visibleRows.map((row, ri) => {
                  const cells = orderedCells(row);
                  if (row.kind === 'section') {
                    return (
                      <tr className="section" key={ri}>
                        {cells.map((c, ci) => <th key={ci}>{c.text}</th>)}
                      </tr>
                    );
                  }
                  if (row.kind === 'sub') {
                    return (
                      <tr className="sub" key={ri}>
                        {cells.map((c, ci) => (
                          <td key={ci} className={ci === 0 ? '' : 'right'} style={highlightCompare && c.isCompare ? { background: '#fff7e6' } : undefined}>
                            {ci === 0 ? c.text : formatNeg(c.text)}
                          </td>
                        ))}
                      </tr>
                    );
                  }
                  return (
                    <tr className="total" key={ri} style={row.kind === 'final' ? { background: '#f4f3f7' } : undefined}>
                      <td>{row.label || ''}</td>
                      {cells.map((c, ci) => (
                        <td key={ci} className="right" style={highlightCompare && c.isCompare ? { background: '#fff7e6' } : undefined}>{formatNeg(c.text)}</td>
                      ))}
                    </tr>
                  );
                })}
                {!reportLoading && currentReport && visibleRows.length === 0 && (
                  <tr className="sub"><td className="px-4 py-4 text-on-surface-variant">No rows for this period.</td></tr>
                )}
              </tbody>
            </table>

            <div className="p-4 border-t border-surface-dim bg-surface-container-low flex items-center justify-between text-[11px] text-on-surface-variant">
              <span data-report-updated>Computed live from posted journal entries</span>
              <span>{currentReport ? `${currentReport.rows.length} rows · Accrual basis` : ''}</span>
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CUSTOMIZE DRAWER (§A report-customizer — Data / Visual)    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className={custOpen ? 'drawer-scrim open' : 'drawer-scrim'} id="cust-scrim" onClick={() => setCustOpen(false)} />
      <div className={custOpen ? 'drawer open' : 'drawer'} id="cust-drawer">
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
            <div>
              <div className="text-headline-sm">Customize report</div>
              <div className="text-[11px] text-on-surface-variant">Data · Visual · Save as view</div>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            data-close-cust
            aria-label="Close"
            onClick={() => setCustOpen(false)}
          >
            <span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>

        {/* Customize tabs */}
        <div className="cust-tab">
          <button className={custTab === 'data' ? 'active' : undefined} data-cust-tab="data" onClick={() => setCustTab('data')}>Data</button>
          <button className={custTab === 'visual' ? 'active' : undefined} data-cust-tab="visual" onClick={() => setCustTab('visual')}>Visual</button>
          <button className={custTab === 'saved' ? 'active' : undefined} data-cust-tab="saved" onClick={() => setCustTab('saved')}>Saved views</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* DATA tab */}
          <div className={custTab === 'data' ? undefined : 'hidden-imp'} data-cust-panel="data">
            <div className="px-4 py-3 border-b border-surface-dim">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Rows</div>
              <select className="w-full h-8 px-2 border border-surface-dim rounded text-[12px]" value={rowsSel} onChange={e => setRowsSel(e.target.value)}>
                <option>All rows</option>
                <option>Non-zero only</option>
              </select>
            </div>
            <div className="px-4 py-3 border-b border-surface-dim">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Columns</div>
              <p className="text-[11px] text-on-surface-variant mb-2">Drag to reorder. Toggle to show/hide.</p>
              {cols.map(item => (
                <div
                  key={item.col}
                  className={draggingCol === item.col ? 'col-item dragging' : 'col-item'}
                  draggable
                  data-col={item.col}
                  onDragStart={() => handleColDragStart(item.col)}
                  onDragEnd={handleColDragEnd}
                  onDragOver={e => handleColDragOver(e, item)}
                >
                  <span className="material-symbols-outlined drag">drag_indicator</span>
                  <input type="checkbox" className="row-check" checked={item.checked} onChange={() => toggleCol(item.col)} />
                  <span className="text-body-sm flex-1">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Filters</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={filterExcludeZero} onChange={() => setFilterExcludeZero(v => !v)} /> Exclude zero rows</label>
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={filterComparePrior} onChange={handleCompareToggle} /> Compare to prior period</label>
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={filterShowPct} onChange={handlePctToggle} /> Show percentages</label>
              </div>
            </div>
          </div>

          {/* VISUAL tab */}
          <div className={custTab === 'visual' ? 'hidden-imp' : undefined} data-cust-panel="visual">
            <div className="px-4 py-4 border-b border-surface-dim">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Number format</div>
              <div className="seg" data-num-format>
                <button className={numFormat === 'dollars' ? 'active' : undefined} data-num="dollars" onClick={() => setNumFormat('dollars')}>1,234.56</button>
                <button className={numFormat === 'thousands' ? 'active' : undefined} data-num="thousands" onClick={() => setNumFormat('thousands')}>1.2K</button>
                <button className={numFormat === 'no-cents' ? 'active' : undefined} data-num="no-cents" onClick={() => setNumFormat('no-cents')}>1,235</button>
                <button className={numFormat === 'percent' ? 'active' : undefined} data-num="percent" onClick={() => setNumFormat('percent')}>12.3%</button>
              </div>
            </div>
            <div className="px-4 py-4 border-b border-surface-dim">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Negatives</div>
              <div className="seg" data-neg-format>
                <button className={negFormat === 'red' ? 'active' : undefined} data-neg="red" onClick={() => setNegFormat('red')}>Red</button>
                <button className={negFormat === 'paren' ? 'active' : undefined} data-neg="paren" onClick={() => setNegFormat('paren')}>(1,234)</button>
                <button className={negFormat === 'minus' ? 'active' : undefined} data-neg="minus" onClick={() => setNegFormat('minus')}>−1,234</button>
              </div>
            </div>
            <div className="px-4 py-4 border-b border-surface-dim">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Decimals</div>
              <div className="seg" data-decimals>
                <button className={decimals === '0' ? 'active' : undefined} data-dec="0" onClick={() => setDecimals('0')}>0</button>
                <button className={decimals === '2' ? 'active' : undefined} data-dec="2" onClick={() => setDecimals('2')}>2</button>
              </div>
            </div>
            <div className="px-4 py-4 border-b border-surface-dim">
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" checked={divideThousands} onChange={() => setDivideThousands(v => !v)} />
                Divide by 1,000 (show in thousands)
              </label>
            </div>
            <div className="px-4 py-4">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Highlight</div>
              <label className="flex items-center gap-2 text-body-sm mb-2"><input type="checkbox" className="row-check" checked={highlightNeg} onChange={() => setHighlightNeg(v => !v)} /> Highlight negative values</label>
              <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={highlightCompare} onChange={() => setHighlightCompare(v => !v)} /> Compare-to-column highlight</label>
            </div>
          </div>

          {/* SAVED tab */}
          <div className={custTab === 'saved' ? 'hidden-imp' : undefined} data-cust-panel="saved">
            <div className="px-4 py-4">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Save current configuration as</div>
              <input
                className="w-full h-8 px-2 border border-surface-dim rounded text-[12px] mb-2"
                placeholder="e.g. P&L — monthly mgmt"
                data-save-name
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
              />
              <button className="w-full h-8 bg-primary text-white rounded text-[12px] font-semibold hover:bg-primary-container mb-4" data-save-view onClick={() => void handleSaveView()}>
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">bookmark_add</span>Save as view</button>

              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Existing views</div>
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center gap-2 py-2 border-b border-surface-dim">
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{v.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{v.from} – {v.to}</div>
                  </div>
                  <button className="h-7 px-2 text-[11px] font-semibold text-primary border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => applySavedView(v)}>Apply</button>
                </div>
              ))}
              {savedViews.length === 0 && (
                <div className="text-[11px] text-on-surface-variant text-center py-4">No saved views yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-cust onClick={() => setCustOpen(false)}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" data-apply-cust onClick={handleApplyCust}>Apply</button>
        </div>
      </div>

      <div className={toastMsg ? 'toast show' : 'toast'} id="toast">{toastMsg}</div>
    </div>
  );
}
