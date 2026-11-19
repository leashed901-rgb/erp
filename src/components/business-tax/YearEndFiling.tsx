'use client';
import './business-tax.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BusinessTaxScreenProps, TAX_NAV, daysUntil } from './types';
import { exportToCsv } from '@/lib/csvExport';

/* Year-end and filing, wired to live data.
   - 1120 lines + KPIs come from GET /api/tax/summary?year=
   - Activity comes from GET /api/tax/filings (SALES-tax filings only —
     acct_tax_filings is not 1120-W estimated payments, so no estimated
     payment totals are shown anywhere on this screen).
   - Checklist reconcile state comes from GET /api/reconciliations;
     1099 count comes from GET /api/parties?role=vendor (is1099).
   - No e-file provider is connected: the drawer is review + draft CSV
     download only. It never claims a return was transmitted to the IRS. */

type FilingAction = 'continue' | 'restart';

interface UnmappedAccount {
  id: string;
  name: string;
  type: string;
}

interface FilingRow {
  id: string;
  period_label: string;
  status: string;
  tax_collected: number;
  tax_remitted: number;
  paid_on: string;
  period_start: string;
}

const money0 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function YearEndFiling({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: BusinessTaxScreenProps) {
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grossYtd, setGrossYtd] = useState(0);
  const [cogsYtd, setCogsYtd] = useState(0);
  const [operatingYtd, setOperatingYtd] = useState(0);
  const [taxableYtd, setTaxableYtd] = useState(0);
  const [estTaxYtd, setEstTaxYtd] = useState(0);
  const [mappable, setMappable] = useState(0);
  const [mapped, setMapped] = useState(0);
  const [unmapped, setUnmapped] = useState<UnmappedAccount[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState(0);
  const [cogsAccounts, setCogsAccounts] = useState(0);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [latestRecon, setLatestRecon] = useState<{ as_of_date: string; status: string } | null>(null);
  const [vendors1099, setVendors1099] = useState(0);

  // E-file drawer (step 4 of 5) — review only, no provider connected
  const [efileOpen, setEfileOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Filing split menu
  const [filingMenuOpen, setFilingMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const splitBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const days = daysUntil('2027-03-15');
  const grossProfit = grossYtd - cogsYtd;
  const unmappedCount = unmapped.length;
  const reconDone = latestRecon?.status === 'reconciled';
  const mappingDone = mappable > 0 && unmappedCount === 0;
  // Steps 1-3 are derivable; steps 4-5 (e-file, confirmed) cannot complete:
  // no e-file provider is connected.
  const doneSteps = (1 + (reconDone ? 1 : 0) + (mappingDone ? 1 : 0));
  const currentStep = mappingDone && reconDone ? 4 : reconDone ? 3 : 2;

  const loadAll = useCallback((y: string) => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch(`/api/tax/summary?year=${y}`).then((r) => r.json()).catch(() => null),
      fetch('/api/tax/filings').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/reconciliations').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/parties?role=vendor').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([sumJson, filJson, recJson, venJson]) => {
        if (sumJson && !sumJson.error) {
          const rows = (sumJson.data || []) as { id: string; type?: string; sectionId?: string; ytd?: string }[];
          const num = (id: string) => {
            const r = rows.find((x) => x.id === id);
            return r ? parseFloat(String(r.ytd || '0').replace(/[$,\s]/g, '')) || 0 : 0;
          };
          setGrossYtd(num('t-sec-income'));
          setCogsYtd(num('t-sec-cogs'));
          setOperatingYtd(num('t-sec-operating'));
          setTaxableYtd(Number(sumJson.meta?.taxableProfit?.ytd ?? 0));
          setEstTaxYtd(Number(sumJson.meta?.estFederalTax?.ytd ?? 0));
          setMappable(Number(sumJson.meta?.mappable ?? 0));
          setMapped(Number(sumJson.meta?.mapped ?? 0));
          setUnmapped((sumJson.meta?.unmapped || []) as UnmappedAccount[]);
          setIncomeAccounts(rows.filter((r) => r.type === 'data' && r.sectionId === 'sec-income').length);
          setCogsAccounts(rows.filter((r) => r.type === 'data' && r.sectionId === 'sec-cogs').length);
        } else if (sumJson?.error) {
          setLoadError(String(sumJson.error.message || 'Could not load tax summary.'));
        }
        setFilings(((filJson.data || []) as Record<string, unknown>[]).map((f) => ({
          id: String(f.id),
          period_label: String(f.period_label || ''),
          status: String(f.status || ''),
          tax_collected: Number(f.tax_collected ?? 0),
          tax_remitted: Number(f.tax_remitted ?? 0),
          paid_on: String(f.paid_on || ''),
          period_start: String(f.period_start || ''),
        })));
        const recs = ((recJson.data || []) as Record<string, unknown>[]);
        setLatestRecon(
          recs.length > 0
            ? { as_of_date: String(recs[0].as_of_date || ''), status: String(recs[0].status || '') }
            : null,
        );
        const vendors = ((venJson.data || []) as Record<string, unknown>[]);
        setVendors1099(vendors.filter((v) => v.is1099 === true || v.track1099 === true).length);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll(year);
  }, [year, loadAll]);

  const navigate = (fn: () => readonly [string, string]) => {
    const [domain, screenId] = fn();
    onNavigate(domain as Parameters<typeof onNavigate>[0], screenId);
  };

  // Close filing menu on outside click
  useEffect(() => {
    if (!filingMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (splitBtnRef.current && splitBtnRef.current.contains(target)) return;
      setFilingMenuOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [filingMenuOpen]);

  function openFilingMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const top = r.bottom + 4;
    const left = Math.min(r.right - 220, window.innerWidth - 240);
    setMenuPos({ top, left });
    setFilingMenuOpen((v) => !v);
  }

  function handleFilingAction(act: FilingAction) {
    setFilingMenuOpen(false);
    if (act === 'continue') {
      setEfileOpen(true);
      return;
    }
    // Restart review: close the drawer, clear the authorization, back to top.
    setEfileOpen(false);
    setAuthorized(false);
    window.scrollTo({ top: 0 });
    onToast('Review restarted from step 1');
  }

  function openEfile() {
    setEfileOpen(true);
  }

  function closeEfile() {
    setEfileOpen(false);
  }

  const form1120Lines = [
    { line: '1a', label: 'Gross receipts or sales', amount: money0(grossYtd), note: `${incomeAccounts} income account${incomeAccounts !== 1 ? 's' : ''} with activity in ${year}` },
    { line: '2', label: 'Cost of goods sold', amount: money0(cogsYtd), note: `${cogsAccounts} COGS account${cogsAccounts !== 1 ? 's' : ''} with activity in ${year}` },
    { line: '3', label: 'Gross profit', amount: money0(grossProfit), note: '' },
    { line: '18', label: 'Other deductions', amount: money0(operatingYtd), note: 'Operating expenses (office, software, shipping, advertising, bank fees)' },
    { line: '20', label: 'Other deductions — unmapped accounts', amount: '—', note: unmappedCount === 0 ? 'All accounts mapped' : `${unmappedCount} account${unmappedCount !== 1 ? 's' : ''} not yet mapped: ${unmapped.map((u) => u.name).join(', ')}` },
    { line: '28', label: 'Taxable income before NOL and special deductions', amount: money0(taxableYtd), note: '' },
    { line: '31', label: 'Total tax', amount: money0(estTaxYtd), note: '21% of Line 28' },
  ];

  function exportDraft1120() {
    exportToCsv(
      form1120Lines.map((l) => ({ line: l.line, description: l.label, amount: l.amount, note: l.note })),
      [
        { key: 'line', label: 'Line' },
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount' },
        { key: 'note', label: 'Note' },
      ],
      `draft-1120-${year}`,
    );
    onToast(`Draft 1120 exported (${form1120Lines.length} lines)`);
  }

  function downloadDraftFromDrawer() {
    if (!authorized) return;
    setEfileOpen(false);
    exportDraft1120();
  }

  // onCreate / onOpenCreateFlyout are part of the shared contract but
  // this screen doesn't surface create actions. Suppressed for lint.
  void onCreate;
  void onOpenCreateFlyout;

  return (
    <>
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Business Tax</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Year-end and filing</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-headline-lg">Year-end and filing</h1>
              <span className="flag-chip">
                <span className="material-symbols-outlined text-[12px]">verified</span>
                Feature enabled
              </span>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Prepare, review, and e-file your annual return for tax year {year}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              <span className="text-label-sm text-on-surface-variant">Tax year</span>
              <select
                className="h-8 px-2 border border-surface-dim rounded text-body-sm bg-white"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option>2026</option>
                <option>2025</option>
                <option>2024</option>
              </select>
            </label>
            <div className="flex split-btn">
              <button
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={openEfile}
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>Continue filing
              </button>
              <button
                ref={splitBtnRef}
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                onClick={openFilingMenu}
                aria-haspopup="menu"
                aria-expanded={filingMenuOpen}
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="bg-error-container/40 border border-error/30 rounded-lg p-3 text-body-sm mb-5">
            {loadError}{' '}
            <button type="button" className="text-primary font-semibold" onClick={() => loadAll(year)}>Retry</button>
          </div>
        )}

        {/* Filing wizard step bar — progress from the derivable checklist */}
        <div className="bg-white rounded-xl border border-surface-dim p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Filing progress</div>
            <div className="text-[11px] text-on-surface-variant">Step {currentStep} of 5 · {Math.round((doneSteps / 5) * 100)}% complete</div>
          </div>
          <div className="step-bar mb-2">
            <div className="step">
              <span className="step-circle done">✓</span>
              <span className="step-label done">Gather data</span>
            </div>
            <div className="step-line done"></div>
            <div className="step">
              <span className={`step-circle ${reconDone ? 'done' : 'active'}`}>{reconDone ? '✓' : '2'}</span>
              <span className={`step-label ${reconDone ? 'done' : 'active'}`}>Reconcile</span>
            </div>
            <div className="step-line done"></div>
            <div className="step">
              <span className={`step-circle ${mappingDone ? 'done' : currentStep === 3 ? 'active' : 'todo'}`}>{mappingDone ? '✓' : '3'}</span>
              <span className={`step-label ${mappingDone ? 'done' : currentStep === 3 ? 'active' : 'todo'}`}>Review 1120 lines</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <span className="step-circle todo">4</span>
              <span className="step-label todo">E-file</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <span className="step-circle todo">5</span>
              <span className="step-label todo">Confirmed</span>
            </div>
          </div>
          <p className="text-[11px] text-on-surface-variant">E-file is not available yet — no e-file provider is connected, so steps 4–5 cannot complete from this app.</p>
        </div>

        {/* KPI strip — live from /api/tax/summary */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="kpi-card">
            <div className="kpi-label">Est. tax due</div>
            <div className="kpi-val">{loading ? '…' : money0(estTaxYtd)}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">21% federal · state TBD</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Taxable profit</div>
            <div className="kpi-val">{loading ? '…' : money0(taxableYtd)}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">YTD · accrual</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Unmapped accounts</div>
            <div className="kpi-val text-error">{loading ? '…' : String(unmappedCount)}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{mapped} of {mappable} mapped</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Days to deadline</div>
            <div className="kpi-val">{days} days</div>
            <div className="text-[11px] text-on-surface-variant mt-1">Mar 15, 2027 (Form 1120)</div>
          </div>
        </div>

        {/* Two-column: 1120 lines + Checklist */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          {/* 1120 form lines preview */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Form 1120 — review lines</h2>
              <span className="text-[11px] text-on-surface-variant">Draft · {unmappedCount > 0 ? '1 line flagged' : 'no lines flagged'}</span>
            </div>
            <div>
              {form1120Lines.map((l) => (
                <div className={`form-line${l.line === '20' && unmappedCount > 0 ? ' flagged' : ''}`} key={l.line}>
                  <div className="ln">{l.line}</div>
                  <div className="desc">
                    <strong>{l.label}</strong>
                    {l.note && <div className="text-[11px] text-on-surface-variant">{l.note}</div>}
                  </div>
                  <div className="amt">{l.amount}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 mt-3 border-t border-surface-dim">
              <button
                className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => navigate(TAX_NAV.summary)}
              >
                <span className="material-symbols-outlined text-[14px]">description</span>Full tax summary
              </button>
              <button
                className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                onClick={exportDraft1120}
              >
                <span className="material-symbols-outlined text-[14px]">download</span>Export draft 1120
              </button>
            </div>
          </div>

          {/* Pre-filing checklist — only derivable items */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Pre-filing checklist</h2>
            <div className="check-item">
              <div className={`check-status ${reconDone ? 'done' : 'todo'}`}>
                <span className="material-symbols-outlined text-[13px]">{reconDone ? 'check' : 'schedule'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-medium">Reconcile all bank accounts</div>
                <div className="text-[11px] text-on-surface-variant">
                  {latestRecon ? `Latest reconciliation ${latestRecon.as_of_date} · ${latestRecon.status}` : 'No reconciliation on file'}
                </div>
              </div>
              <button
                className="h-6 px-2 border border-surface-dim rounded text-[11px] font-semibold text-primary hover:bg-surface-container-low"
                onClick={() => navigate(TAX_NAV.reconcile)}
              >
                Open
              </button>
            </div>
            <div className="check-item">
              <div className="check-status done">
                <span className="material-symbols-outlined text-[13px]">check</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-medium">Confirm year-end date</div>
                <div className="text-[11px] text-on-surface-variant">12/31/{year}</div>
              </div>
            </div>
            <div className="check-item">
              <div className={`check-status ${mappingDone ? 'done' : 'warn'}`}>
                <span className="material-symbols-outlined text-[13px]">{mappingDone ? 'check' : 'warning'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-medium">Map all accounts to tax lines</div>
                <div className="text-[11px] text-on-surface-variant">{mapped} of {mappable} mapped</div>
              </div>
              <button
                className="h-6 px-2 border border-surface-dim rounded text-[11px] font-semibold text-primary hover:bg-surface-container-low"
                onClick={() => navigate(TAX_NAV.summary)}
              >
                Fix
              </button>
            </div>
            <div className="check-item">
              <div className="check-status done">
                <span className="material-symbols-outlined text-[13px]">check</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-medium">Review 1099 contractors</div>
                <div className="text-[11px] text-on-surface-variant">{vendors1099} contractor{vendors1099 !== 1 ? 's' : ''} flagged 1099 · due Jan 31, 2027</div>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column: Deadline + Recent activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Key filing dates — countdowns computed live */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Key filing dates</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                <span className="material-symbols-outlined text-[20px] text-qb-blue">event</span>
                <div className="flex-1">
                  <div className="text-body-sm font-semibold">E-file window opens</div>
                  <div className="text-[11px] text-on-surface-variant">Jan 15, 2027 — IRS MeF system opens</div>
                </div>
                <span className="text-[11px] text-on-surface-variant">{daysUntil('2027-01-15')} days</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                <span className="material-symbols-outlined text-[20px] text-qb-maroon">schedule</span>
                <div className="flex-1">
                  <div className="text-body-sm font-semibold">Form 1120 due</div>
                  <div className="text-[11px] text-on-surface-variant">Mar 15, 2027 — or file extension (Sep 15, 2027)</div>
                </div>
                <span className="text-[11px] text-on-surface-variant">{days} days</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                <span className="material-symbols-outlined text-[20px] text-qb-green">payments</span>
                <div className="flex-1">
                  <div className="text-body-sm font-semibold">Payment due (no extension)</div>
                  <div className="text-[11px] text-on-surface-variant">Mar 15, 2027 — est. {loading ? '…' : money0(estTaxYtd)} balance</div>
                </div>
                <span className="text-[11px] text-on-surface-variant">{days} days</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                <span className="material-symbols-outlined text-[20px] text-qb-teal">assignment</span>
                <div className="flex-1">
                  <div className="text-body-sm font-semibold">1099-NEC to contractors</div>
                  <div className="text-[11px] text-on-surface-variant">Jan 31, 2027 — {vendors1099} contractor{vendors1099 !== 1 ? 's' : ''} flagged 1099</div>
                </div>
                <span className="text-[11px] text-on-surface-variant">{daysUntil('2027-01-31')} days</span>
              </div>
            </div>
          </div>

          {/* Recent filing activity — live sales-tax filings only */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Recent filing activity</h2>
            {loading ? (
              <p className="text-body-sm text-on-surface-variant">Loading…</p>
            ) : filings.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">No tax filings recorded.</p>
            ) : (
              <div className="space-y-3 text-body-sm">
                {filings.slice(0, 5).map((f) => (
                  <div className="flex items-start gap-2" key={f.id}>
                    <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5">check_circle</span>
                    <div className="min-w-0">
                      <div className="font-medium">Sales-tax filing {f.period_label}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        {money0(f.tax_collected)} collected · {money0(f.tax_remitted)} remitted · {f.status}
                        {f.paid_on ? ` · ${f.paid_on}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className="w-full mt-3 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1"
              onClick={() => navigate(TAX_NAV.overview)}
            >
              <span className="material-symbols-outlined text-[14px]">history</span>Back to Business Tax
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ FILING SPLIT MENU ═══════════ */}
      <div
        ref={menuRef}
        className={`menu ${filingMenuOpen ? 'open' : ''}`}
        style={filingMenuOpen ? { top: menuPos.top, left: menuPos.left } : undefined}
      >
        <div className="menu-header">Continue filing</div>
        <button onClick={() => handleFilingAction('continue')}>
          <span className="material-symbols-outlined">play_arrow</span>Continue from step 3
        </button>
        <button onClick={() => handleFilingAction('restart')}>
          <span className="material-symbols-outlined">restart_alt</span>Restart review
        </button>
      </div>

      {/* ═══════════ E-FILE DRAWER (step 4 of 5) — review only ═══════════ */}
      <div
        className={`drawer-scrim ${efileOpen ? 'open' : ''}`}
        onClick={closeEfile}
        aria-hidden={!efileOpen}
      />
      <div
        className={`drawer ${efileOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="E-file Form 1120"
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">upload_file</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">E-file Form 1120</div>
              <div className="text-[11px] text-on-surface-variant">Step 4 of 5 · Tax year {year}</div>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            onClick={closeEfile}
            aria-label="Close drawer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3">
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Filing summary</div>
            <div className="grid grid-cols-2 gap-2 text-[12px] mt-2">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Form</span>
                <span className="font-semibold">1120 (C-Corp)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Tax year</span>
                <span className="font-semibold">{year}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Est. tax due</span>
                <span className="font-semibold tabular-nums">{loading ? '…' : money0(estTaxYtd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Unmapped accounts</span>
                <span className="font-semibold tabular-nums">{unmappedCount}</span>
              </div>
            </div>
          </div>

          <div className="bg-error-container/40 border border-error/30 rounded-lg p-3 text-[11px] text-on-error-container flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">warning</span>
            <div>No e-file provider is connected. This return cannot be transmitted from the app — review the draft here and file it with your preparer, or download the draft CSV below.</div>
          </div>

          <div>
            <label className="field-label">Filing signer</label>
            <input
              className="field-input"
              placeholder="Signer name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Contact email for IRS acknowledgment</label>
            <input
              className="field-input"
              placeholder="name@company.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>

          <div className="border-t border-surface-dim pt-3">
            <label className="flex items-start gap-2 text-body-sm cursor-pointer">
              <input
                type="checkbox"
                className="row-check mt-0.5"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
              />
              <span>
                I confirm that the figures above match the books and that this draft is ready to file with my preparer.
              </span>
            </label>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={closeEfile}
          >
            Cancel
          </button>
          <button
            className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!authorized}
            onClick={downloadDraftFromDrawer}
          >
            <span className="material-symbols-outlined text-[16px] align-middle mr-1">download</span>Download draft CSV
          </button>
        </div>
      </div>
    </>
  );
}
