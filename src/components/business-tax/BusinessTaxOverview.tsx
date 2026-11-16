'use client';
import './business-tax.css';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { BusinessTaxScreenProps, TAX_NAV, daysUntil, deadlineTone } from './types';
import type {
  TaxNexus,
  NexusAlert,
  TaxExemption,
  TaxTransaction,
  TaxRule,
  TaxabilityRule,
  TaxLineOption,
  TaxJurisdiction,
  TaxFiling,
  MarketplaceRemittance,
} from '@/lib/taxTypes';

/** Raw acct_tax_codes row as returned by GET /api/v1/tax/rates. */
interface TaxCodeRow {
  id: string;
  code: string;
  name: string;
  tax_type: string;
  rate: number;
  effective_from: string | null;
  is_active: boolean;
  jurisdiction: { name: string; state_code: string | null } | null;
}

/** GET /api/tax/overview — the pack-5 stat bar source. */
interface TaxOverviewData {
  salesTaxPayable: number;
  nexusStates: number;
  taxableSalesMtd: number;
  nextFilingDue: { dueDate: string; periodLabel: string | null; status: string } | null;
}

type DeadlineTone = 'past' | 'urgent' | 'soon' | 'far';

interface DeadlineBadge {
  tone: DeadlineTone;
  icon: string;
  label: string;
}

function computeDeadlineBadge(iso: string): DeadlineBadge {
  const days = daysUntil(iso);
  const tone = deadlineTone(days);
  const icon =
    tone === 'past' ? 'check_circle' : tone === 'urgent' ? 'warning' : tone === 'soon' ? 'schedule' : 'event';
  const label = tone === 'past' ? `${Math.abs(days)}d ago` : `${days} days left`;
  return { tone, icon, label };
}

interface UnmappedAccount {
  id: string;
  name: string;
  type: string;
}

interface TaxCategory {
  id: string;
  code: string;
  name: string;
  description: string;
}

const money0 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BusinessTaxOverview({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: BusinessTaxScreenProps) {
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    taxableProfitYtd: number;
    grossIncomeYtd: number;
    cogsYtd: number;
    operatingYtd: number;
    mappable: number;
    mapped: number;
    unmapped: UnmappedAccount[];
    categories: TaxCategory[];
  }>({
    taxableProfitYtd: 0,
    grossIncomeYtd: 0,
    cogsYtd: 0,
    operatingYtd: 0,
    mappable: 0,
    mapped: 0,
    unmapped: [],
    categories: [],
  });
  const [filings, setFilings] = useState<{ id: string; period_label: string; status: string; tax_collected: number; amount_due: number; period_start: string }[]>([]);
  const [saved, setSaved] = useState(false);

  /* Tax detail (Batch B) — the agent-a /api/tax/* routes the screens never
     consumed: nexus, exemptions, tax transactions, rules, taxability rules,
     tax lines. Tabs lazy-load their route; creates POST to the matching
     route and reload the tab. Transactions + tax lines are read-only
     (system-generated / reference data). */
  type DetailTab = 'nexus' | 'exemptions' | 'transactions' | 'rules' | 'taxability' | 'lines' | 'filings' | 'rates' | 'remittance';
  const [detailTab, setDetailTab] = useState<DetailTab>('nexus');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [nexusData, setNexusData] = useState<{ nexus: TaxNexus[]; alerts: NexusAlert[] } | null>(null);
  const [salesFilings, setSalesFilings] = useState<TaxFiling[] | null>(null);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRow[] | null>(null);
  const [remittances, setRemittances] = useState<MarketplaceRemittance[] | null>(null);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [payBankId, setPayBankId] = useState('');
  const [taxOverview, setTaxOverview] = useState<TaxOverviewData | null>(null);
  const [exemptions, setExemptions] = useState<TaxExemption[] | null>(null);
  const [taxTxns, setTaxTxns] = useState<TaxTransaction[] | null>(null);
  const [taxRules, setTaxRules] = useState<TaxRule[] | null>(null);
  const [taxabilityRules, setTaxabilityRules] = useState<TaxabilityRule[] | null>(null);
  const [taxLines, setTaxLines] = useState<TaxLineOption[] | null>(null);
  const [jurisdictions, setJurisdictions] = useState<TaxJurisdiction[] | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[] | null>(null);
  const [txnDirection, setTxnDirection] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadDetailTab = useCallback(async (tab: DetailTab, force = false) => {
    setDetailError(null);
    setDetailLoading(true);
    try {
      if (tab === 'nexus' && (force || !nexusData)) {
        const j = await fetch('/api/tax/nexus').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Nexus load failed');
        setNexusData(j?.data || { nexus: [], alerts: [] });
        if (!jurisdictions) {
          const jj = await fetch('/api/tax/jurisdictions').then((r) => r.json()).catch(() => null);
          setJurisdictions((jj?.data || []) as TaxJurisdiction[]);
        }
      } else if (tab === 'exemptions' && (force || !exemptions)) {
        const j = await fetch('/api/tax/exemptions').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Exemptions load failed');
        setExemptions((j?.data || []) as TaxExemption[]);
        if (!customers) {
          const cj = await fetch('/api/parties?role=customer').then((r) => r.json()).catch(() => null);
          setCustomers(((cj?.data || []) as Record<string, unknown>[]).map((c) => ({ id: String(c.id), name: String(c.displayName || c.name || c.email || 'Customer') })));
        }
        if (!jurisdictions) {
          const jj = await fetch('/api/tax/jurisdictions').then((r) => r.json()).catch(() => null);
          setJurisdictions((jj?.data || []) as TaxJurisdiction[]);
        }
      } else if (tab === 'transactions' && (force || !taxTxns)) {
        const q = txnDirection ? `?direction=${encodeURIComponent(txnDirection)}` : '';
        const j = await fetch(`/api/tax/tax-transactions${q}`).then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Transactions load failed');
        setTaxTxns((j?.data || []) as TaxTransaction[]);
      } else if (tab === 'rules' && (force || !taxRules)) {
        const j = await fetch('/api/tax/rules').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Rules load failed');
        setTaxRules((j?.data || []) as TaxRule[]);
      } else if (tab === 'taxability' && (force || !taxabilityRules)) {
        const j = await fetch('/api/tax/taxability-rules').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Taxability rules load failed');
        setTaxabilityRules((j?.data || []) as TaxabilityRule[]);
        if (!jurisdictions) {
          const jj = await fetch('/api/tax/jurisdictions').then((r) => r.json()).catch(() => null);
          setJurisdictions((jj?.data || []) as TaxJurisdiction[]);
        }
      } else if (tab === 'lines' && !taxLines) {
        const j = await fetch('/api/tax/tax-lines').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Tax lines load failed');
        setTaxLines((j?.data || []) as TaxLineOption[]);
      } else if (tab === 'filings' && (force || !salesFilings)) {
        const j = await fetch('/api/tax/sales-filings').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Filings load failed');
        setSalesFilings((j?.data || []) as TaxFiling[]);
        if (!jurisdictions) {
          const jj = await fetch('/api/tax/jurisdictions').then((r) => r.json()).catch(() => null);
          setJurisdictions((jj?.data || []) as TaxJurisdiction[]);
        }
        if (!bankAccounts) {
          const bj = await fetch('/api/finance/bank-accounts').then((r) => r.json()).catch(() => null);
          const list = ((bj?.data || []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name || b.accountName || 'Bank account') }));
          setBankAccounts(list);
          if (list.length > 0) setPayBankId((cur) => cur || list[0].id);
        }
      } else if (tab === 'rates' && (force || !taxCodes)) {
        const j = await fetch('/api/v1/tax/rates').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Rates load failed');
        setTaxCodes((j?.data || []) as TaxCodeRow[]);
        if (!jurisdictions) {
          const jj = await fetch('/api/tax/jurisdictions').then((r) => r.json()).catch(() => null);
          setJurisdictions((jj?.data || []) as TaxJurisdiction[]);
        }
      } else if (tab === 'remittance' && (force || !remittances)) {
        const j = await fetch('/api/tax/remittance').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Remittance load failed');
        setRemittances((j?.data || []) as MarketplaceRemittance[]);
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setDetailLoading(false);
    }
  }, [nexusData, exemptions, taxTxns, taxRules, taxabilityRules, taxLines, salesFilings, taxCodes, remittances, bankAccounts, jurisdictions, customers, txnDirection]);

  const loadTaxOverview = useCallback(async () => {
    const j = await fetch('/api/tax/overview').then((r) => r.json()).catch(() => null);
    if (j?.data) setTaxOverview(j.data as TaxOverviewData);
  }, []);

  useEffect(() => {
    void loadTaxOverview();
  }, [loadTaxOverview]);

  useEffect(() => {
    void loadDetailTab(detailTab);
  }, [detailTab, loadDetailTab]);

  useEffect(() => {
    if (detailTab === 'transactions') void loadDetailTab('transactions', true);
  }, [txnDirection]); // eslint-disable-line react-hooks/exhaustive-deps

  const postDetail = useCallback(async (path: string, body: Record<string, unknown>, tab: DetailTab) => {
    setCreateError(null);
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) {
      setCreateError(j?.error?.message || `Save failed (${res.status})`);
      return false;
    }
    setShowCreate(false);
    await loadDetailTab(tab, true);
    void loadTaxOverview();
    onToast('Saved');
    return true;
  }, [loadDetailTab, loadTaxOverview, onToast]);

  const deleteRule = useCallback(async (path: string, tab: DetailTab) => {
    const res = await fetch(path, { method: 'DELETE' });
    if (!res.ok) {
      onToast('Delete failed');
      return;
    }
    await loadDetailTab(tab, true);
    onToast('Deleted');
  }, [loadDetailTab, onToast]);

  const loadAll = useCallback((y: string) => {
    setLoading(true);
    Promise.all([
      fetch(`/api/tax/summary?year=${y}`).then((r) => r.json()).catch(() => null),
      fetch('/api/tax/filings').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([sumJson, filJson]) => {
        if (sumJson && !sumJson.error) {
          const rows = (sumJson.data || []) as { id: string; ytd?: string }[];
          const num = (id: string) => {
            const r = rows.find((x) => x.id === id);
            return r ? parseFloat(String(r.ytd || '0').replace(/[$,\s]/g, '')) || 0 : 0;
          };
          setSummary({
            taxableProfitYtd: Number(sumJson.meta?.taxableProfit?.ytd ?? 0),
            grossIncomeYtd: num('t-sec-income'),
            cogsYtd: num('t-sec-cogs'),
            operatingYtd: num('t-sec-operating'),
            mappable: Number(sumJson.meta?.mappable ?? 0),
            mapped: Number(sumJson.meta?.mapped ?? 0),
            unmapped: (sumJson.meta?.unmapped || []) as UnmappedAccount[],
            categories: (sumJson.meta?.categories || []) as TaxCategory[],
          });
        }
        setFilings(((filJson.data || []) as Record<string, unknown>[]).map((f) => ({
          id: String(f.id),
          period_label: String(f.period_label || ''),
          status: String(f.status || ''),
          tax_collected: Number(f.tax_collected ?? 0),
          amount_due: Number(f.amount_due ?? 0),
          period_start: String(f.period_start || ''),
        })));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll(year);
  }, [year, loadAll]);

  useEffect(() => {
    if (summary.mappable > 0 && summary.unmapped.length === 0) setSaved(true);
    else setSaved(false);
  }, [summary]);

  const mappedCount = summary.mapped;
  const unmappedCount = summary.unmapped.length;
  const progressPct = summary.mappable > 0 ? (mappedCount / summary.mappable) * 100 : 0;
  const allMapped = summary.mappable > 0 && unmappedCount === 0;
  const estTax = Math.max(0, summary.taxableProfitYtd * 0.21);

  // Next deadline: first upcoming date in the fixed C-Corp calendar.
  const nextDeadline = useMemo(() => {
    const dates = [
      { label: 'Q4 estimated payment', date: '2027-01-15' },
      { label: 'Annual return (Form 1120)', date: '2027-03-15' },
      { label: 'Final payment / extension deadline', date: '2027-04-15' },
    ];
    return dates.find((d) => daysUntil(d.date) >= 0) ?? dates[0];
  }, []);

  const handleSelectChange = async (accountId: string, categoryId: string) => {
    if (!categoryId) return;
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tax_category_id: categoryId }),
    });
    if (!res.ok) {
      onToast('Could not save mapping');
      return;
    }
    onToast('Mapping saved');
    loadAll(year);
  };

  const handleSave = () => {
    if (!allMapped) return;
    setSaved(true);
    onToast('Tax mapping saved');
  };

  const navigate = (fn: () => readonly [string, string]) => {
    const [domain, screenId] = fn();
    onNavigate(domain as Parameters<typeof onNavigate>[0], screenId);
  };

  // Pre-compute future deadline badges once
  const q4Badge = computeDeadlineBadge('2027-01-15');
  const annualBadge = computeDeadlineBadge('2027-03-15');
  const finalBadge = computeDeadlineBadge('2027-04-15');

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
          <span className="text-label-md text-primary font-semibold">Overview</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Business Tax — Overview</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Tax year {year} · Unsaid · C-Corp · Accrual basis
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
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => navigate(TAX_NAV.summary)}
            >
              <span className="material-symbols-outlined text-[16px]">description</span>Tax summary
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Est. taxable profit</span>
            <div className="text-headline-lg mt-1 tabular-nums">{loading ? '…' : money0(summary.taxableProfitYtd)}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">YTD · accrual</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Est. tax due</span>
            <div className="text-headline-lg mt-1 tabular-nums">{loading ? '…' : money0(estTax)}</div>
            <div className="text-[11px] text-tertiary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>21% federal · state TBD
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Next deadline</span>
            <div className="text-headline-lg mt-1">{nextDeadline.date === '2027-01-15' ? 'Jan 15, 2027' : nextDeadline.date === '2027-03-15' ? 'Mar 15, 2027' : 'Apr 15, 2027'}</div>
            <div className="text-[11px] text-tertiary mt-1">{nextDeadline.label}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Mapped accounts</span>
            <div className="text-headline-lg mt-1 tabular-nums">
              <span>{mappedCount}</span> / {summary.mappable}
            </div>
            <div className="text-[11px] text-error mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              {saved ? 'All accounts mapped' : `${unmappedCount} account${unmappedCount !== 1 ? 's' : ''} need${unmappedCount === 1 ? 's' : ''} mapping`}
            </div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">
            Create actions:
          </span>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Tax summary')}
          >
            <span className="material-symbols-outlined text-[16px]">description</span>Tax summary
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Estimated payment')}
          >
            <span className="material-symbols-outlined text-[16px]">payments</span>Estimated payment
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Tax payment')}
          >
            <span className="material-symbols-outlined text-[16px]">account_balance</span>Tax payment
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('File extension')}
          >
            <span className="material-symbols-outlined text-[16px]">schedule</span>File extension
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
            onClick={onOpenCreateFlyout}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Two-column: Deadlines + Taxable profit breakdown */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          {/* Deadlines */}
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Filing deadlines</h2>
              <span className="text-[11px] text-on-surface-variant">Tax year 2026 · C-Corp</span>
            </div>
            <div className="space-y-2">
              {/* No estimated payments on file — acct_tax_filings holds sales-tax
                  filings only, not 1120-W estimates. Do not show paid quarters
                  until an estimated-payment record exists. */}
              <div className="rounded-lg border border-surface-dim bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
                No estimated payments recorded for {year}. The filings on file are sales-tax
                filings, not 1120-W estimates — see Recent tax activity below.
              </div>

              {/* Q4 — computed countdown */}
              <div className={`deadline-card ${q4Badge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Jan</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Q4 estimated payment</span>
                    <span className={`deadline-status ${q4Badge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{q4Badge.icon}</span>
                      {q4Badge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">Form 1120-W · est. tax for the year {loading ? '…' : money0(estTax)}</div>
                </div>
                <button
                  className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container"
                  onClick={() => onCreate('Estimated payment')}
                >
                  Pay
                </button>
              </div>

              {/* Annual return — computed countdown */}
              <div className={`deadline-card ${annualBadge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Mar</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Annual return (Form 1120)</span>
                    <span className={`deadline-status ${annualBadge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{annualBadge.icon}</span>
                      {annualBadge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">Fiscal year 2026 · e-file</div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() => navigate(TAX_NAV.filing)}
                >
                  Start
                </button>
              </div>

              {/* Final payment — computed countdown */}
              <div className={`deadline-card ${finalBadge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Apr</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Final payment / extension deadline</span>
                    <span className={`deadline-status ${finalBadge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{finalBadge.icon}</span>
                      {finalBadge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Pay balance owed after annual return
                  </div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() => navigate(TAX_NAV.filing)}
                >
                  Start
                </button>
              </div>
            </div>
          </div>

          {/* Taxable profit breakdown (bar chart) — live from /api/tax/summary */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Taxable profit breakdown</h2>
            <div className="bar-row">
              <div className="bar-label">Gross income</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-green" style={{ width: `${summary.grossIncomeYtd > 0 ? 100 : 0}%` }}></div>
              </div>
              <div className="bar-value">{loading ? '…' : money0(summary.grossIncomeYtd).replace('.00', '')}</div>
            </div>
            <div className="bar-row">
              <div className="bar-label">COGS</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-maroon" style={{ width: `${summary.grossIncomeYtd > 0 ? Math.round((summary.cogsYtd / summary.grossIncomeYtd) * 100) : 0}%` }}></div>
              </div>
              <div className="bar-value">{loading ? '…' : `−${money0(summary.cogsYtd).replace('.00', '')}`}</div>
            </div>
            <div className="bar-row">
              <div className="bar-label">Deductible expenses</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-maroon" style={{ width: `${summary.grossIncomeYtd > 0 ? Math.round((summary.operatingYtd / summary.grossIncomeYtd) * 100) : 0}%` }}></div>
              </div>
              <div className="bar-value">{loading ? '…' : `−${money0(summary.operatingYtd).replace('.00', '')}`}</div>
            </div>
            <div className="bar-row mt-2 pt-2 border-t border-surface-dim">
              <div className="bar-label font-semibold text-on-surface">Taxable profit</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-blue" style={{ width: `${summary.grossIncomeYtd > 0 ? Math.max(0, Math.round((summary.taxableProfitYtd / summary.grossIncomeYtd) * 100)) : 0}%` }}></div>
              </div>
              <div className="bar-value text-qb-blue">{loading ? '…' : money0(summary.taxableProfitYtd).replace('.00', '')}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-surface-dim space-y-1 text-[11px] text-on-surface-variant">
              <div className="flex justify-between">
                <span>Federal rate (C-Corp)</span>
                <span className="font-semibold">21%</span>
              </div>
              <div className="flex justify-between">
                <span>Est. federal tax</span>
                <span className="font-semibold tabular-nums">{loading ? '…' : money0(estTax)}</span>
              </div>
              <div className="flex justify-between">
                <span>State (TN)</span>
                <span className="font-semibold tabular-nums">No state income tax</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-surface-dim">
                <span className="font-semibold text-on-surface">Total est. tax</span>
                <span className="font-semibold text-on-surface tabular-nums">{loading ? '…' : money0(estTax)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map accounts task */}
        <div className="map-task mb-5">
          {saved ? (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[24px] text-secondary">check_circle</span>
              <div>
                <h2 className="text-headline-sm">All accounts mapped</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  {summary.mappable} of {summary.mappable} accounts are mapped to tax categories. Ready for filing.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-headline-sm">Map accounts to tax categories</h2>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Every income &amp; expense account needs a tax line before filing. {mappedCount} of{' '}
                    {summary.mappable} mapped.
                  </p>
                </div>
                {allMapped ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary-container text-on-secondary-container">
                    All mapped
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-error-container text-on-error-container">
                    {unmappedCount} need mapping
                  </span>
                )}
              </div>
              <div className="progress mb-3">
                <div style={{ width: `${progressPct}%` }}></div>
              </div>
              <div>
                {summary.unmapped.map((row) => (
                  <div className="unmapped-row" key={row.id}>
                    <span className="dot" style={{ background: row.type === 'revenue' ? '#2e7d32' : row.type === 'asset' ? '#1565c0' : '#8e2424' }}></span>
                    <span className="text-body-sm font-medium flex-1">{row.name}</span>
                    <span className="text-[11px] text-on-surface-variant">{row.type}</span>
                    <select value="" onChange={(e) => handleSelectChange(row.id, e.target.value)}>
                      <option value="">— Map to tax category —</option>
                      {summary.categories.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} — {opt.description}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {summary.unmapped.length === 0 && !loading && (
                  <p className="text-body-sm text-on-surface-variant">No unmapped accounts with activity in {year}.</p>
                )}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-dim">
                <button
                  className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                  onClick={() => navigate(TAX_NAV.coa)}
                >
                  <span className="material-symbols-outlined text-[14px]">account_tree</span>Open chart of accounts
                </button>
                <button
                  className="h-8 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!allMapped}
                  onClick={handleSave}
                >
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">save</span>Save mapping
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom row: Mini reports + recent activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Quick reports */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Tax reports</h2>
              <button
                className="text-[11px] text-primary font-semibold hover:underline"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                View all reports
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.summary)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-blue">description</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Tax summary</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Income / deductions / assets</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-maroon">gavel</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Sales tax liability</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Collected minus paid</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-green">receipt_long</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Payroll tax (941)</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Quarterly federal</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-teal">assignment</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Form 1120 prep</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Annual return worksheet</div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent activity — derived from live /api/tax/filings rows
              (sales-tax filings only; no 1120-W estimates exist in the books). */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Recent tax activity</h2>
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
                        {money0(f.tax_collected)} collected · {f.status}
                        {f.period_start ? ` · ${f.period_start}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className="w-full mt-3 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1"
              onClick={() => navigate(TAX_NAV.reports)}
            >
              <span className="material-symbols-outlined text-[14px]">history</span>View reports
            </button>
          </div>
        </div>

        {/* Tax detail (Batch B) — nexus, exemptions, transactions, rules,
            taxability rules, tax lines. Previously routes-only. */}
        <div className="bg-white rounded-xl border border-surface-dim p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-sm">Tax detail</h2>
            {(detailTab === 'nexus' || detailTab === 'exemptions' || detailTab === 'rules' || detailTab === 'taxability' || detailTab === 'filings' || detailTab === 'rates' || detailTab === 'remittance') && (
              <button
                className="h-8 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container"
                onClick={() => { setCreateError(null); setShowCreate(!showCreate); }}
              >
                {showCreate ? 'Cancel' : '+ Add'}
              </button>
            )}
          </div>
          {/* Sales-tax stat bar (kpis-5) — every tile is a live number
              from /api/tax/overview and a door into its tab. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            <button className="text-left bg-surface-container-low rounded-xl border border-surface-dim p-3 hover:border-primary" onClick={() => setDetailTab('filings')}>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Sales tax payable</span>
              <div className="text-headline-md mt-1 tabular-nums">{taxOverview ? money0(taxOverview.salesTaxPayable) : '…'}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Open, unfiled tax</div>
            </button>
            <button className="text-left bg-surface-container-low rounded-xl border border-surface-dim p-3 hover:border-primary" onClick={() => setDetailTab('nexus')}>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Nexus states</span>
              <div className="text-headline-md mt-1 tabular-nums">{taxOverview ? taxOverview.nexusStates : '…'}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Collecting registrations</div>
            </button>
            <button className="text-left bg-surface-container-low rounded-xl border border-surface-dim p-3 hover:border-primary" onClick={() => setDetailTab('transactions')}>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Taxable sales MTD</span>
              <div className="text-headline-md mt-1 tabular-nums">{taxOverview ? money0(taxOverview.taxableSalesMtd) : '…'}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">From posted tax lines</div>
            </button>
            <button className="text-left bg-surface-container-low rounded-xl border border-surface-dim p-3 hover:border-primary" onClick={() => setDetailTab('filings')}>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Next filing due</span>
              <div className="text-headline-md mt-1">{taxOverview?.nextFilingDue ? taxOverview.nextFilingDue.dueDate : '—'}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">{taxOverview?.nextFilingDue ? (taxOverview.nextFilingDue.periodLabel || taxOverview.nextFilingDue.status) : 'No open filings'}</div>
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-4">
            {([
              ['nexus', 'Nexus'],
              ['exemptions', 'Exemptions'],
              ['transactions', 'Transactions'],
              ['rules', 'Tax rules'],
              ['taxability', 'Taxability'],
              ['lines', 'Tax lines'],
              ['filings', 'Filings'],
              ['rates', 'Rates'],
              ['remittance', 'Remittance'],
            ] as [DetailTab, string][]).map(([id, label]) => (
              <button
                key={id}
                className={`h-8 px-3 rounded-full text-label-sm font-medium ${detailTab === id ? 'bg-primary text-white' : 'border border-surface-dim hover:bg-surface-container-low'}`}
                onClick={() => { setShowCreate(false); setDetailTab(id); }}
              >
                {label}
              </button>
            ))}
          </div>
          {detailLoading && <p className="text-body-sm text-on-surface-variant">Loading…</p>}
          {detailError && <p className="text-body-sm text-error">Couldn’t load this tab: {detailError}</p>}
          {createError && <p className="text-body-sm text-error mb-2">{createError}</p>}

          {detailTab === 'nexus' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void postDetail('/api/tax/nexus', {
                      jurisdictionId: String(fd.get('jurisdictionId') || ''),
                      nexusType: String(fd.get('nexusType') || 'economic'),
                      filingFrequency: String(fd.get('filingFrequency') || 'monthly'),
                      registrationNumber: String(fd.get('registrationNumber') || '') || undefined,
                    }, 'nexus');
                  }}
                >
                  <select name="jurisdictionId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Jurisdiction —</option>
                    {(jurisdictions || []).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                  </select>
                  <select name="nexusType" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="economic">
                    <option value="physical">Physical</option>
                    <option value="economic">Economic</option>
                    <option value="marketplace">Marketplace</option>
                  </select>
                  <select name="filingFrequency" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="monthly">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                  <input name="registrationNumber" placeholder="Registration number (optional)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Register nexus</button>
                </form>
              )}
              {(nexusData?.nexus.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No nexus registrations. Register where you have a physical presence or pass the economic threshold.</p>
              ) : (
                <div className="space-y-2">
                  {nexusData!.nexus.map((n) => (
                    <div key={n.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{n.jurisdictionName || 'Jurisdiction'}</span> <span className="text-on-surface-variant">· {n.nexusType} · {n.filingFrequency || '—'}</span></div>
                      <div className="text-right text-[11px] text-on-surface-variant">
                        <div>{n.collectTax ? 'Collecting tax' : 'Not collecting'}</div>
                        <div>{n.registrationNumber || 'No registration #'} {n.registeredOn ? `· since ${n.registeredOn}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(nexusData?.alerts.length || 0) > 0 && (
                <div className="mt-3 space-y-2">
                  {nexusData!.alerts.map((a) => (
                    <div key={a.id} className="text-body-sm border border-error-container rounded-lg px-3 py-2">
                      <span className="font-medium">{a.stateCode}</span> — {a.pctOfThreshold}% of the economic threshold ({a.countedSales} sales, {a.countedTxns} transactions) · {a.status}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'exemptions' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void postDetail('/api/tax/exemptions', {
                      customerId: String(fd.get('customerId') || ''),
                      jurisdictionId: String(fd.get('jurisdictionId') || '') || undefined,
                      reason: String(fd.get('reason') || '') || undefined,
                      certificateNo: String(fd.get('certificateNo') || '') || undefined,
                      validFrom: String(fd.get('validFrom') || '') || undefined,
                      validTo: String(fd.get('validTo') || '') || undefined,
                    }, 'exemptions');
                  }}
                >
                  <select name="customerId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Customer —</option>
                    {(customers || []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <select name="jurisdictionId" className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Any jurisdiction —</option>
                    {(jurisdictions || []).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                  </select>
                  <input name="reason" placeholder="Reason (e.g. resale)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="certificateNo" placeholder="Certificate number" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="validFrom" type="date" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="validTo" type="date" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Record exemption</button>
                </form>
              )}
              {(exemptions?.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No exemption certificates on file.</p>
              ) : (
                <div className="space-y-2">
                  {exemptions!.map((x) => (
                    <div key={x.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{x.customerName || 'Customer'}</span> <span className="text-on-surface-variant">· {x.reason || '—'}</span></div>
                      <div className="text-right text-[11px] text-on-surface-variant">
                        <div>{x.certificateNo || 'No certificate #'}</div>
                        <div>{x.validFrom || '—'} → {x.validTo || '—'}{x.verifiedAt ? ' · verified' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'transactions' && !detailLoading && (
            <>
              <div className="flex gap-2 mb-3">
                <select value={txnDirection} onChange={(e) => setTxnDirection(e.target.value)} className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                  <option value="">All directions</option>
                  <option value="sale">Sales</option>
                  <option value="purchase">Purchases</option>
                </select>
              </div>
              {(taxTxns?.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No tax transactions recorded{txnDirection ? ` for ${txnDirection}s` : ''}. Transactions are created by sales and purchases, not by hand.</p>
              ) : (
                <div className="space-y-2">
                  {taxTxns!.map((t) => (
                    <div key={t.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{t.taxDate}</span> <span className="text-on-surface-variant">· {t.direction} · {t.sourceDocType || '—'} · {t.taxCategory || '—'}</span></div>
                      <div className="text-right tabular-nums">
                        <div>{money0(t.taxAmount)} tax <span className="text-on-surface-variant">on {money0(t.taxableAmount)} @ {(t.rate || 0).toFixed(2)}%</span></div>
                        <div className="text-[11px] text-on-surface-variant">gross {money0(t.grossAmount)}{t.exemptAmount ? ` · exempt ${money0(t.exemptAmount)}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'rules' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const pct = Number(fd.get('ratePct') || 0);
                    void postDetail('/api/tax/rules', {
                      jurisdiction: String(fd.get('jurisdiction') || ''),
                      taxType: String(fd.get('taxType') || ''),
                      rate: pct / 100,
                      stateCode: String(fd.get('stateCode') || '') || undefined,
                      taxCode: String(fd.get('taxCode') || '') || undefined,
                      classification: String(fd.get('classification') || '') || undefined,
                    }, 'rules');
                  }}
                >
                  <input name="jurisdiction" required placeholder="Jurisdiction (e.g. Tennessee)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="taxType" required placeholder="Tax type (e.g. sales)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="ratePct" required type="number" step="0.01" min="0" max="100" placeholder="Rate % (e.g. 7)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="stateCode" placeholder="State code (e.g. TN)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="taxCode" placeholder="Tax code" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="classification" placeholder="Classification" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add rule</button>
                </form>
              )}
              {(taxRules?.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No tax rate rules. Add one to drive automatic tax calculation.</p>
              ) : (
                <div className="space-y-2">
                  {taxRules!.map((r) => (
                    <div key={r.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{r.jurisdiction || '—'}</span> <span className="text-on-surface-variant">· {r.taxType || '—'} · {(r.rate * 100).toFixed(2)}%{r.taxCode ? ` · ${r.taxCode}` : ''}{r.classification ? ` · ${r.classification}` : ''}</span></div>
                      <button className="text-[11px] text-error font-semibold hover:underline" onClick={() => void deleteRule(`/api/tax/rules/${r.id}`, 'rules')}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'taxability' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const pctRaw = String(fd.get('ratePct') || '');
                    void postDetail('/api/tax/taxability-rules', {
                      jurisdictionId: String(fd.get('jurisdictionId') || '') || undefined,
                      taxCategory: String(fd.get('taxCategory') || ''),
                      treatment: String(fd.get('treatment') || ''),
                      rateOverride: pctRaw === '' ? undefined : Number(pctRaw) / 100,
                      priority: Number(fd.get('priority') || 0),
                      name: String(fd.get('name') || '') || undefined,
                      direction: String(fd.get('direction') || 'sale'),
                      effectiveFrom: String(fd.get('effectiveFrom') || '') || undefined,
                    }, 'taxability');
                  }}
                >
                  <select name="jurisdictionId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Jurisdiction —</option>
                    {(jurisdictions || []).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                  </select>
                  <input name="taxCategory" required placeholder="Tax category (e.g. clothing)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="treatment" required placeholder="Treatment (e.g. taxable)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="ratePct" type="number" step="0.01" min="0" max="100" placeholder="Rate override % (optional)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="priority" type="number" defaultValue="0" placeholder="Priority" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="name" required placeholder="Rule name" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <select name="direction" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="sale">
                    <option value="sale">Sale</option>
                    <option value="purchase">Purchase</option>
                  </select>
                  <input name="effectiveFrom" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add taxability rule</button>
                </form>
              )}
              {(taxabilityRules?.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No taxability rules. Rules decide how a category is treated, in priority order.</p>
              ) : (
                <div className="space-y-2">
                  {taxabilityRules!.map((r) => (
                    <div key={r.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{r.name || r.taxCategory || 'Rule'}</span> <span className="text-on-surface-variant">· {r.treatment || '—'} · {r.jurisdictionName || 'any jurisdiction'} · priority {r.priority}{r.rateOverride != null ? ` · ${(r.rateOverride * 100).toFixed(2)}%` : ''}</span></div>
                      <button className="text-[11px] text-error font-semibold hover:underline" onClick={() => void deleteRule(`/api/tax/taxability-rules/${r.id}`, 'taxability')}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'filings' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void postDetail('/api/tax/sales-filings/prepare', {
                      jurisdictionId: String(fd.get('jurisdictionId') || ''),
                      periodStart: String(fd.get('periodStart') || ''),
                      periodEnd: String(fd.get('periodEnd') || ''),
                      dueDate: String(fd.get('dueDate') || '') || undefined,
                    }, 'filings');
                  }}
                >
                  <select name="jurisdictionId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Jurisdiction —</option>
                    {(jurisdictions || []).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                  </select>
                  <input name="dueDate" type="date" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="periodStart" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="periodEnd" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Prepare filing from posted tax</button>
                </form>
              )}
              {(salesFilings || []).length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No sales tax filings yet. Prepare one for a period — it totals the posted tax lines for that jurisdiction.</p>
              ) : (
                <div className="space-y-2">
                  {(salesFilings || []).map((f) => (
                    <div key={f.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div>
                        <span className="font-medium">{f.jurisdictionName || 'Jurisdiction'}</span>
                        <span className="text-on-surface-variant"> · {f.periodLabel || `${f.periodStart} → ${f.periodEnd}`} · {f.status}</span>
                        <div className="text-[11px] text-on-surface-variant">Taxable {money0(f.taxableSales)} · Collected {money0(f.taxCollected)} · Remitted {money0(f.taxRemitted)}{f.dueDate ? ` · Due ${f.dueDate}` : ''}</div>
                      </div>
                      {f.status !== 'paid' && (
                        <div className="flex items-center gap-2">
                          <select className="h-8 border border-surface-dim rounded px-2 text-body-sm" value={payBankId} onChange={(e) => setPayBankId(e.target.value)}>
                            {(bankAccounts || []).map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                          </select>
                          <button
                            className="h-8 px-3 bg-primary text-white rounded text-label-sm font-semibold disabled:opacity-50"
                            disabled={!payBankId}
                            onClick={() => void postDetail(`/api/tax/sales-filings/${f.id}/pay`, { bankAccountId: payBankId }, 'filings')}
                          >
                            Pay {money0(f.amountDue)}
                          </button>
                        </div>
                      )}
                      {f.status === 'paid' && <span className="text-[11px] text-on-surface-variant">Paid{f.paidOn ? ` ${f.paidOn}` : ''}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'rates' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void postDetail('/api/v1/tax/rates', {
                      code: String(fd.get('code') || ''),
                      name: String(fd.get('name') || ''),
                      jurisdiction_id: String(fd.get('jurisdictionId') || '') || undefined,
                      rate: (Number(fd.get('ratePct')) || 0) / 100,
                      tax_type: 'sales',
                    }, 'rates');
                  }}
                >
                  <select name="jurisdictionId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                    <option value="">— Jurisdiction —</option>
                    {(jurisdictions || []).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                  </select>
                  <input name="ratePct" type="number" step="0.001" min="0" max="100" required placeholder="Rate % (e.g. 7.25)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="code" required placeholder="Code (e.g. TN-STD)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="name" required placeholder="Name" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add rate</button>
                </form>
              )}
              {(taxCodes || []).length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No tax rates on file. Rates here are the engine&apos;s acct_tax_codes — the numbers acct_calculate_tax actually charges.</p>
              ) : (
                <div className="space-y-2">
                  {(taxCodes || []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{c.code}</span> <span className="text-on-surface-variant">· {c.name} · {c.jurisdiction?.name || '—'}</span></div>
                      <div className="text-right text-[11px] text-on-surface-variant">
                        <div className="text-body-sm font-medium text-on-surface">{(Number(c.rate) * 100).toFixed(3)}%</div>
                        <div>{c.tax_type}{c.effective_from ? ` · from ${c.effective_from}` : ''}{c.is_active ? '' : ' · inactive'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'remittance' && !detailLoading && (
            <>
              {showCreate && (
                <form
                  className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void postDetail('/api/tax/remittance', {
                      jurisdiction: String(fd.get('jurisdiction') || ''),
                      periodStart: String(fd.get('periodStart') || ''),
                      periodEnd: String(fd.get('periodEnd') || ''),
                      taxCollected: Number(fd.get('taxCollected')) || 0,
                      amountRemitted: Number(fd.get('amountRemitted')) || 0,
                      confirmationNumber: String(fd.get('confirmationNumber') || '') || undefined,
                    }, 'remittance');
                  }}
                >
                  <input name="jurisdiction" required placeholder="Jurisdiction (e.g. Tennessee)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="confirmationNumber" placeholder="Confirmation # (optional)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="periodStart" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="periodEnd" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="taxCollected" type="number" step="0.01" min="0" placeholder="Tax collected by marketplace" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <input name="amountRemitted" type="number" step="0.01" min="0" placeholder="Amount remitted" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
                  <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Record remittance</button>
                </form>
              )}
              {(remittances || []).length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No marketplace remittances recorded. When a marketplace collects and remits tax for the tenant&apos;s sales, it is recorded here — it stays out of the tenant&apos;s own liability.</p>
              ) : (
                <div className="space-y-2">
                  {(remittances || []).map((r) => (
                    <div key={r.id} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <div><span className="font-medium">{r.jurisdiction}</span> <span className="text-on-surface-variant">· {r.periodStart} → {r.periodEnd} · {r.status}</span></div>
                      <div className="text-right text-[11px] text-on-surface-variant">
                        <div className="text-body-sm font-medium text-on-surface">{money0(r.amountRemitted)} remitted</div>
                        <div>{money0(r.taxCollected)} collected{r.confirmationNumber ? ` · #${r.confirmationNumber}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'lines' && !detailLoading && (
            <>
              {(taxLines?.length || 0) === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No tax lines defined.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {taxLines!.map((l) => (
                    <div key={l.id || l.label} className="flex items-center justify-between border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                      <span className="font-medium">{l.label}</span>
                      <span className="text-[11px] text-on-surface-variant">{l.form} · line {l.line}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-on-surface-variant mt-3">Reference data — lines are the canonical Form 1120 labels used by the account-mapping picker.</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
