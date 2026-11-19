'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { fetchReport, useSavedReportViews, reportViewMutations } from '@/hooks/useAccountingApi';
import type { ReportDto, SavedViewDto } from '@/lib/acctTypes';
import styles from './ReportsScreen.module.css';

interface ReportRow {
  kind: 'section' | 'sub' | 'total' | 'final';
  label?: string;
  cells: string[];
}

interface ReportCard {
  id: string;
  title: string;
  category: 'financial' | 'sales' | 'expenses' | 'accounting' | 'tax';
  range: string;
  description: string;
  icon: string;
  iconClass: string;
}

/* The library cards are chrome; every number in the viewer is computed
   live by /api/accounting/reports/[id] from the posted GL */
const REPORT_CARDS: ReportCard[] = [
  { id: 'pnl', title: 'Profit and Loss', category: 'financial', range: 'Period + year to date', description: 'Revenue minus costs, broken down by account.', icon: 'trending_up', iconClass: styles.iconWrapBlue },
  { id: 'bs', title: 'Balance Sheet', category: 'financial', range: 'As of date', description: 'Snapshot of what you own, owe, and are worth.', icon: 'balance', iconClass: styles.iconWrapTeal },
  { id: 'cashflow', title: 'Statement of Cash Flows', category: 'financial', range: 'Period', description: 'Where cash came from and where it went.', icon: 'waterfall_chart', iconClass: styles.iconWrapGreen },
  { id: 'araging', title: 'A/R Aging Summary', category: 'sales', range: 'As of date', description: 'Outstanding invoices by aging bucket. Posted invoices only — drafts excluded.', icon: 'hourglass_top', iconClass: styles.iconWrapMaroon },
  { id: 'apaging', title: 'A/P Aging Summary', category: 'expenses', range: 'As of date', description: 'Outstanding bills by aging bucket. Posted bills only — drafts excluded.', icon: 'hourglass_bottom', iconClass: styles.iconWrapMaroon },
  { id: 'monthly-pnl', title: 'Monthly P&L', category: 'financial', range: 'All months', description: 'Income, spend, and net by month, with prior-year net.', icon: 'calendar_month', iconClass: styles.iconWrapBlue },
  { id: 'sales-funnel', title: 'Sales Funnel', category: 'sales', range: 'All invoices', description: 'Invoices by stage: draft, unpaid, overdue, deposited, paid.', icon: 'filter_list', iconClass: styles.iconWrapNavy },
  { id: 'bill-funnel', title: 'Bill Funnel', category: 'expenses', range: 'All bills', description: 'Bills by stage: review, approval, unpaid, overdue, paid.', icon: 'filter_list', iconClass: styles.iconWrapMaroon },
  { id: 'spend-by-category', title: 'Spend by Category', category: 'expenses', range: 'Period', description: 'Posted expense by account for the period.', icon: 'pie_chart', iconClass: styles.iconWrapMaroon },
  { id: 'salesbycustomer', title: 'Sales by Customer', category: 'sales', range: 'Period', description: 'Revenue per customer for the period.', icon: 'groups', iconClass: styles.iconWrapNavy },
  { id: 'expensesbyvendor', title: 'Expenses by Vendor', category: 'expenses', range: 'Period', description: 'Spend per vendor for the period.', icon: 'receipt_long', iconClass: styles.iconWrapMaroon },
  { id: 'gl', title: 'General Ledger', category: 'accounting', range: 'Period · All accounts', description: 'All account activity for the period.', icon: 'menu_book', iconClass: styles.iconWrapBlue },
  { id: 'tb', title: 'Trial Balance', category: 'accounting', range: 'As of date', description: 'Account balances at a point in time.', icon: 'rule', iconClass: styles.iconWrapTeal },
  { id: 'salestax', title: 'Sales Tax Liability', category: 'tax', range: 'Period', description: 'Sales tax collected minus paid.', icon: 'gavel', iconClass: styles.iconWrapGreen },
  { id: 'bank-feed-review', title: 'Bank Feed Review', category: 'accounting', range: 'Latest 100', description: 'Bank transactions with review status, suggested rule, and category.', icon: 'account_balance', iconClass: styles.iconWrapTeal },
  { id: 'bank-feed-stages', title: 'Bank Feed Stages', category: 'accounting', range: 'Current', description: 'Feed items by review stage, per bank account.', icon: 'layers', iconClass: styles.iconWrapTeal },
  { id: 'tasks-due', title: 'Close Tasks Due', category: 'accounting', range: 'Current', description: 'Open close tasks with due dates and overdue flags.', icon: 'task_alt', iconClass: styles.iconWrapBlue },
  { id: 'undeposited', title: 'Undeposited Payments', category: 'accounting', range: 'Current', description: 'Posted receipts not yet deposited to a bank account.', icon: 'payments', iconClass: styles.iconWrapGreen },
  { id: 'account-list', title: 'Account List', category: 'accounting', range: 'As of date', description: 'Every chart account with its live balance and last activity.', icon: 'list_alt', iconClass: styles.iconWrapBlue },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthBounds = (d: Date) => ({
  from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
  to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
});
const THIS_MONTH = monthBounds(new Date());

interface ColItem {
  col: string;
  label: string;
  checked: boolean;
}

export interface ReportsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function ReportsScreen({ onNavigate, onToast }: ReportsScreenProps) {
  const [activeView, setActiveView] = useState<'library' | 'viewer'>('library');
  const [selectedReportId, setSelectedReportId] = useState<string>('pnl');
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date range
  const [dateFrom, setDateFrom] = useState(THIS_MONTH.from);
  const [dateTo, setDateTo] = useState(THIS_MONTH.to);
  const [rangePreset, setRangePreset] = useState('This month');

  // Live report data + saved views
  const [reportData, setReportData] = useState<ReportDto | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const { views: savedViews, refresh: refreshViews } = useSavedReportViews();

  // Customize Drawer
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [custTab, setCustTab] = useState<'data' | 'visual' | 'saved'>('data');
  const [negFormat, setNegFormat] = useState<'red' | 'paren' | 'minus'>('red');
  const [highlightNeg, setHighlightNeg] = useState(true);
  const [savedViewName, setSavedViewName] = useState('');
  const [cols, setCols] = useState<ColItem[]>([]);
  const [rowsSel, setRowsSel] = useState('All rows');
  const [excludeZero, setExcludeZero] = useState(false);
  const [comparePrior, setComparePrior] = useState(false);
  const [showPct, setShowPct] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const currentReport: ReportDto | null = reportData && reportData.id === selectedReportId ? reportData : null;
  const activeCard = REPORT_CARDS.find((c) => c.id === selectedReportId);
  const activeTitle = currentReport?.title || activeCard?.title || 'Report';

  // Filtered reports in Library
  const filteredReports = useMemo(() => {
    return REPORT_CARDS.filter((r) => {
      if (activeCategoryTab !== 'all' && r.category !== activeCategoryTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeCategoryTab, searchQuery]);

  const openReportViewer = (id: string) => {
    setSelectedReportId(id);
    setActiveView('viewer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Fetch (and refetch on range / compare / pct change) */
  useEffect(() => {
    if (activeView !== 'viewer') return;
    let alive = true;
    setReportLoading(true);
    (async () => {
      const res = await fetchReport(selectedReportId, { from: dateFrom, to: dateTo, compare: comparePrior, pct: showPct });
      if (!alive) return;
      setReportLoading(false);
      if (res.ok && res.data) {
        setReportData(res.data);
        setCols((prev) => {
          const prevChecked = new Map(prev.map((c) => [c.col, c.checked]));
          return res.data!.columns.map((label, i) => ({
            col: `c${i}`,
            label: label || 'Account',
            checked: prevChecked.get(`c${i}`) ?? true,
          }));
        });
      } else showToast(res.error || 'Report failed to load');
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedReportId, dateFrom, dateTo, comparePrior, showPct]);

  const handlePresetChange = (preset: string) => {
    setRangePreset(preset);
    const now = new Date();
    if (preset === 'This month') {
      const b = monthBounds(now);
      setDateFrom(b.from);
      setDateTo(b.to);
    } else if (preset === 'Last month') {
      const b = monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      setDateFrom(b.from);
      setDateTo(b.to);
    } else if (preset === 'This quarter') {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      setDateFrom(iso(qStart));
      setDateTo(iso(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0)));
    } else if (preset === 'This year') {
      setDateFrom(`${now.getFullYear()}-01-01`);
      setDateTo(`${now.getFullYear()}-12-31`);
    } else if (preset === 'Last year') {
      setDateFrom(`${now.getFullYear() - 1}-01-01`);
      setDateTo(`${now.getFullYear() - 1}-12-31`);
    }
  };

  const formatNegative = (val: string) => {
    if (!val || !val.startsWith('−')) return val;
    if (negFormat === 'red') {
      return highlightNeg ? <span className={styles.numNeg}>{val}</span> : val;
    }
    if (negFormat === 'paren') {
      return <span className={styles.numNeg}>({val.slice(1)})</span>;
    }
    return val;
  };

  /* Row/column shaping from the customize state */
  const hideZero = rowsSel === 'Non-zero only' || excludeZero;
  const visibleRows: ReportRow[] = (currentReport?.rows ?? []).filter((row) => {
    if (!hideZero || row.kind !== 'sub') return true;
    return row.cells.slice(1).some((c) => c !== '—' && c !== '' && c !== '$0.00');
  });
  const colIdx = (c: ColItem) => parseInt(c.col.slice(1), 10);
  const orderedCells = (row: ReportRow): string[] => {
    if (!currentReport || cols.length === 0) return row.cells;
    const shown = cols.filter((c) => c.checked);
    if (row.kind === 'total' || row.kind === 'final') {
      return shown.filter((c) => colIdx(c) > 0).map((c) => row.cells[colIdx(c) - 1] ?? '');
    }
    return shown.map((c) => row.cells[colIdx(c)] ?? '');
  };

  const handleCompareToggle = () => {
    if (!comparePrior && selectedReportId !== 'pnl') {
      showToast('Compare to prior period is available on Profit and Loss');
      return;
    }
    setComparePrior((v) => !v);
  };
  const handlePctToggle = () => {
    if (!showPct && selectedReportId !== 'pnl') {
      showToast('Percentages are available on Profit and Loss');
      return;
    }
    setShowPct((v) => !v);
  };

  const handleSaveView = async () => {
    const name = savedViewName.trim();
    if (!name) {
      showToast('Name is required');
      return;
    }
    const res = await reportViewMutations.save({
      name,
      from: dateFrom,
      to: dateTo,
      config: { reportId: selectedReportId, cols, rowsSel, excludeZero, comparePrior, showPct, negFormat, highlightNeg },
    });
    if (res.ok) {
      showToast(`Saved view "${name}"`);
      setSavedViewName('');
      await refreshViews();
    } else showToast(res.error || 'View could not be saved');
  };

  const applySavedView = (v: SavedViewDto) => {
    const cfg = v.config || {};
    const reportId = typeof cfg.reportId === 'string' ? cfg.reportId : null;
    if (!reportId) {
      showToast('This view has no report');
      return;
    }
    if (Array.isArray(cfg.cols)) setCols(cfg.cols as ColItem[]);
    if (typeof cfg.rowsSel === 'string') setRowsSel(cfg.rowsSel);
    if (typeof cfg.excludeZero === 'boolean') setExcludeZero(cfg.excludeZero);
    if (typeof cfg.comparePrior === 'boolean') setComparePrior(cfg.comparePrior);
    if (typeof cfg.showPct === 'boolean') setShowPct(cfg.showPct);
    if (cfg.negFormat === 'red' || cfg.negFormat === 'paren' || cfg.negFormat === 'minus') setNegFormat(cfg.negFormat);
    if (typeof cfg.highlightNeg === 'boolean') setHighlightNeg(cfg.highlightNeg);
    setDateFrom(v.from || dateFrom);
    setDateTo(v.to || dateTo);
    setIsCustomizeOpen(false);
    openReportViewer(reportId);
    showToast(`View "${v.name}" applied`);
  };

  return (
    <div className={styles.container}>
      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>
            {activeView === 'viewer' ? activeTitle : 'Quick view'}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 1 — REPORT LIBRARY                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeView === 'library' && (
        <main className={styles.main}>
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Quick view</h1>
              <p className={styles.pageSubtitle}>
                Report shortcuts — each opens with the customize panel and Save view.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => showToast('Start from a standard report, then Customize → Save as view')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  add
                </span>
                Custom report
              </button>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => { setCustTab('saved'); setIsCustomizeOpen(true); }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  bookmark
                </span>
                Saved views
              </button>
            </div>
          </div>

          {/* Search */}
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.searchIcon}`}>
              search
            </span>
            <input
              className={styles.searchInput}
              placeholder="Search reports…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Tabs */}
          <div className={styles.tabsBar}>
            {[
              { id: 'all', label: 'All' },
              { id: 'financial', label: 'Financial statements' },
              { id: 'sales', label: 'Sales & customers' },
              { id: 'expenses', label: 'Expenses & vendors' },
              { id: 'accounting', label: 'Accounting' },
              { id: 'tax', label: 'Tax' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabBtn} ${
                  activeCategoryTab === tab.id ? styles.tabBtnActive : ''
                }`}
                onClick={() => setActiveCategoryTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Report Grid */}
          <div className={styles.reportGrid}>
            {filteredReports.map((r) => (
              <div
                key={r.id}
                className={styles.reportCard}
                onClick={() => openReportViewer(r.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={`${styles.iconWrap} ${r.iconClass}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {r.icon}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1c1e' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#5a6355' }}>{r.range}</div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#5a6355', margin: 0 }}>{r.description}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 2 — REPORT VIEWER                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeView === 'viewer' && (
        <main style={{ paddingBottom: 48 }}>
          {/* Viewer Header */}
          <div className={styles.viewerHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setActiveView('library')}
                title="Back to reports library"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  arrow_back
                </span>
              </button>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{activeTitle}</div>
                <div style={{ fontSize: 11, color: '#5a6355' }}>
                  {currentReport?.range || `${dateFrom} – ${dateTo}`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className={styles.dateRangeGroup}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, color: '#5a6355' }}
                >
                  calendar_today
                </span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <span style={{ fontSize: 11, color: '#5a6355' }}>to</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                <select
                  className={styles.dateInput}
                  value={rangePreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="Custom">Custom</option>
                  <option value="This month">This month</option>
                  <option value="Last month">Last month</option>
                  <option value="This quarter">This quarter</option>
                  <option value="This year">This year</option>
                  <option value="Last year">Last year</option>
                </select>
              </div>

              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => setIsCustomizeOpen(true)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  tune
                </span>
                Customize
              </button>

              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => {
                  if (!currentReport) {
                    showToast('Nothing to export');
                    return;
                  }
                  const labels = currentReport.columns.map((c, i) => c || `Column ${i + 1}`);
                  const rows: Record<string, unknown>[] = visibleRows.map((r) => {
                    const obj: Record<string, unknown> = {};
                    if (r.kind === 'total' || r.kind === 'final') {
                      obj[labels[0]] = r.label || '';
                      r.cells.forEach((c, i) => { obj[labels[i + 1]] = c; });
                    } else {
                      r.cells.forEach((c, i) => { obj[labels[i]] = c; });
                    }
                    return obj;
                  });
                  exportToCsv(rows, labels.map((l) => ({ key: l, label: l })), `report-${currentReport.id}`);
                  showToast(`Exported ${rows.length} records to CSV`);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  download
                </span>
                Export ▾
              </button>

              <button
                type="button"
                className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
                onClick={() => {
                  if (typeof window !== 'undefined') window.print();
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  print
                </span>
                Print
              </button>
            </div>
          </div>

          {/* Formal Report Document Paper Card */}
          <div style={{ padding: '0 24px' }}>
            <div className={styles.paperCard}>
              <div className={styles.paperHeader}>
                <div className={styles.paperCompany}>Unsaid</div>
                <div className={styles.paperTitle}>{activeTitle}</div>
                <div className={styles.paperMeta}>
                  {currentReport?.range || `${dateFrom} – ${dateTo}`}
                </div>
                <div style={{ fontSize: 11, color: '#5a6355', marginTop: 2 }}>
                  Accrual basis · USD ($)
                </div>
              </div>

              <table className={styles.rptTable}>
                <tbody>
                  {reportLoading && (
                    <tr className={styles.subRow}><td>Computing from the general ledger…</td></tr>
                  )}
                  {!reportLoading && visibleRows.map((row, idx) => {
                    const cells = orderedCells(row);
                    if (row.kind === 'section') {
                      return (
                        <tr key={idx} className={styles.sectionRow}>
                          {cells.map((c, i) => (
                            <td key={i} className={i === 0 ? '' : styles.alignRight}>
                              {c}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (row.kind === 'sub') {
                      return (
                        <tr key={idx} className={styles.subRow}>
                          {cells.map((c, i) => (
                            <td key={i} className={i === 0 ? '' : styles.alignRight}>
                              {i === 0 ? c : formatNegative(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return (
                      <tr key={idx} className={row.kind === 'final' ? styles.finalRow : styles.totalRow}>
                        <td>{row.label}</td>
                        {cells.map((c, i) => (
                          <td key={i} className={styles.alignRight}>
                            {formatNegative(c)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {!reportLoading && currentReport && visibleRows.length === 0 && (
                    <tr className={styles.subRow}><td>No rows for this period.</td></tr>
                  )}
                </tbody>
              </table>

              <div className={styles.paperFooter}>
                <span>Computed live from posted journal entries</span>
                <span>{currentReport ? `${currentReport.rows.length} rows · Accrual basis` : ''}</span>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═══════════ CUSTOMIZE DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isCustomizeOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsCustomizeOpen(false)}
      />
      <aside
        className={`${styles.drawer} ${isCustomizeOpen ? styles.drawerOpen : ''}`}
      >
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              tune
            </span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Customize report</h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>
                Data · Visual · Save as view
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.headerBtn}
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            onClick={() => setIsCustomizeOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        {/* Customize Tabs */}
        <div className={styles.custTabRow}>
          {(['data', 'visual', 'saved'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.custTabBtn} ${custTab === t ? styles.custTabBtnActive : ''}`}
              onClick={() => setCustTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {custTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Rows
                </label>
                <select className={styles.dateInput} style={{ width: '100%', height: 36 }} value={rowsSel} onChange={(e) => setRowsSel(e.target.value)}>
                  <option>All rows</option>
                  <option>Non-zero only</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Columns
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cols.map((c) => (
                    <label
                      key={c.col}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#becab6' }}>
                        drag_indicator
                      </span>
                      <input
                        type="checkbox"
                        checked={c.checked}
                        onChange={() => setCols((prev) => prev.map((x) => (x.col === c.col ? { ...x, checked: !x.checked } : x)))}
                        style={{ accentColor: '#0077c5' }}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                  {cols.length === 0 && <span style={{ fontSize: 12, color: '#5a6355' }}>Open a report to see its columns.</span>}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Filters
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} checked={excludeZero} onChange={() => setExcludeZero((v) => !v)} />
                    Exclude zero rows
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} checked={comparePrior} onChange={handleCompareToggle} />
                    Compare to prior period
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} checked={showPct} onChange={handlePctToggle} />
                    Show percentages
                  </label>
                </div>
              </div>
            </div>
          )}

          {custTab === 'visual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Negatives representation
                </label>
                <div className={styles.segGroup}>
                  {(['red', 'paren', 'minus'] as const).map((nf) => (
                    <button
                      key={nf}
                      type="button"
                      className={`${styles.segBtn} ${negFormat === nf ? styles.segBtnActive : ''}`}
                      onClick={() => setNegFormat(nf)}
                    >
                      {nf === 'red' ? 'Red' : nf === 'paren' ? '(1,234)' : '−1,234'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Highlighting
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={highlightNeg} onChange={() => setHighlightNeg((v) => !v)} style={{ accentColor: '#0077c5' }} />
                  Highlight negative values in red
                </label>
              </div>
            </div>
          )}

          {custTab === 'saved' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Save view as
                </label>
                <input
                  className={styles.dateInput}
                  style={{ width: '100%', height: 36, marginBottom: 8 }}
                  placeholder="e.g. Monthly P&L — Executive"
                  value={savedViewName}
                  onChange={(e) => setSavedViewName(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.headerBtnPrimary}
                  style={{ width: '100%', height: 36, borderRadius: 6, cursor: 'pointer' }}
                  onClick={() => void handleSaveView()}
                >
                  Save as view
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Existing views
                </label>
                {savedViews.map((v) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eeedf1' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: '#5a6355' }}>{v.from} – {v.to}</div>
                    </div>
                    <button
                      type="button"
                      className={styles.headerBtn}
                      onClick={() => applySavedView(v)}
                    >
                      Apply
                    </button>
                  </div>
                ))}
                {savedViews.length === 0 && (
                  <div style={{ fontSize: 12, color: '#5a6355', textAlign: 'center', padding: '12px 0' }}>No saved views yet.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            height: 56,
            padding: '0 20px',
            borderTop: '1px solid #dad9dd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setIsCustomizeOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
            onClick={() => {
              setIsCustomizeOpen(false);
              showToast('Customizations applied');
            }}
          >
            Apply
          </button>
        </div>
      </aside>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
