'use client';

import { useCallback, useEffect, useState } from 'react';
import { DemoRow } from '@/data/shellData';
import { fetchJson } from '@/hooks/useCrmApi';
import type { CapState } from '@/lib/capTypes';
import { exportToCsv } from '@/lib/csvExport';
import StatusPill from '@/components/StatusPill';
import styles from './CapTableScreens.module.css';

interface CapTableScreenRendererProps {
  screenId: string;
  onGotoScreen: (screenId: string) => void;
  onCapCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (message: string) => void;
}

function toDemoRow(obj: object): DemoRow {
  const out: DemoRow = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' || typeof v === 'number') {
      out[k] = v;
    }
  }
  return out;
}

function parseNumeric(val: string, fallback: number): number {
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const numFmt = (n: number) => n.toLocaleString('en-US');
const pctFmt = (n: number) => `${n.toFixed(2)}%`;
const today = () => new Date().toISOString().slice(0, 10);

function useCapState() {
  const [state, setState] = useState<CapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState('');

  const refresh = useCallback(async (asOfDate?: string) => {
    setLoading(true);
    const res = await fetchJson<{ data: CapState }>(
      `/api/equity/state${asOfDate ? `?as_of=${asOfDate}` : ''}`,
    );
    if (!res.ok) {
      setError(res.error ?? 'Failed to load cap table.');
      setLoading(false);
      return;
    }
    setState(res.data.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyAsOf = useCallback(
    (date: string) => {
      setAsOf(date);
      void refresh(date || undefined);
    },
    [refresh],
  );

  return { state, loading, error, refresh, asOf, applyAsOf };
}

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
};

const CREATE_DEFS: Record<string, { title: string; sub: string; url: string; fields: FieldDef[] }> = {
  'Share issuance': {
    title: 'Issue shares',
    sub: 'Issues shares through cap_issue_shares — authorized-share check, par floor, and the equity journal post when a bank account is given.',
    url: '/api/cap/securities/issue',
    fields: [
      { key: 'stakeholder_id', label: 'Stakeholder', type: 'select', options: [], required: true },
      { key: 'class_id', label: 'Share class', type: 'select', options: [], required: true },
      { key: 'shares', label: 'Shares', type: 'number', required: true },
      { key: 'price_per_share', label: 'Price per share ($)', type: 'number', required: true },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
      { key: 'consideration', label: 'Consideration', type: 'select', options: [
        { value: 'cash', label: 'Cash' },
        { value: 'ip_assignment', label: 'IP assignment' },
        { value: 'services', label: 'Services' },
        { value: 'conversion', label: 'Conversion' },
        { value: 'exercise', label: 'Exercise' },
        { value: 'debt_cancellation', label: 'Debt cancellation' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'bank_account_id', label: 'Bank account (posts the cash journal)', type: 'select', options: [{ value: '', label: 'No bank account — no journal posted' }] },
      { key: 'certificate_no', label: 'Certificate no. (optional)', type: 'text' },
    ],
  },
  'Option grant': {
    title: 'Grant options',
    sub: 'Grants through cap_grant_options — pool availability is enforced and the 409A FMV guard rejects a strike below fair market value.',
    url: '/api/cap/grants',
    fields: [
      { key: 'pool_id', label: 'Option pool', type: 'select', options: [], required: true },
      { key: 'stakeholder_id', label: 'Stakeholder', type: 'select', options: [], required: true },
      { key: 'shares', label: 'Shares', type: 'number', required: true },
      { key: 'exercise_price', label: 'Exercise price ($)', type: 'number', required: true },
      { key: 'granted_on', label: 'Grant date', type: 'date', required: true },
      { key: 'vesting_months', label: 'Vesting (months)', type: 'number' },
      { key: 'cliff_months', label: 'Cliff (months)', type: 'number' },
      { key: 'early_exercise', label: 'Early exercise allowed (unvested shares; enables 83(b))', type: 'checkbox' },
      { key: 'grant_type', label: 'Type', type: 'select', options: [
        { value: 'iso', label: 'ISO' },
        { value: 'nso', label: 'NSO' },
        { value: 'rsu', label: 'RSU' },
        { value: 'sar', label: 'SAR' },
      ] },
    ],
  },
  SAFE: {
    title: 'New SAFE / convertible',
    sub: 'Records a SAFE or convertible note. It converts into shares when a round closes.',
    url: '/api/cap/securities/issue',
    fields: [
      { key: 'stakeholder_id', label: 'Stakeholder', type: 'select', options: [], required: true },
      { key: 'instrument', label: 'Instrument', type: 'select', options: [
        { value: 'safe_post_money', label: 'SAFE — post-money' },
        { value: 'safe_pre_money', label: 'SAFE — pre-money' },
        { value: 'convertible_note', label: 'Convertible note' },
      ], required: true },
      { key: 'principal', label: 'Principal ($)', type: 'number', required: true },
      { key: 'issued_on', label: 'Issued on', type: 'date', required: true },
      { key: 'valuation_cap', label: 'Valuation cap ($, optional)', type: 'number' },
      { key: 'discount_pct', label: 'Discount (%, optional)', type: 'number' },
      { key: 'interest_rate', label: 'Interest rate (decimal, notes only)', type: 'number' },
      { key: 'mfn', label: 'MFN', type: 'checkbox' },
      { key: 'proRata', label: 'Pro-rata rights', type: 'checkbox' },
    ],
  },
  Round: {
    title: 'New funding round',
    sub: 'Creates a planned round. Close it from the Rounds screen — the close prices the round, issues investor shares, and converts outstanding SAFEs.',
    url: '/api/cap/rounds',
    fields: [
      { key: 'name', label: 'Round name', type: 'text', placeholder: 'Series A', required: true },
      { key: 'round_type', label: 'Type', type: 'select', options: [
        { value: 'pre_seed', label: 'Pre-seed' },
        { value: 'seed', label: 'Seed' },
        { value: 'series_a', label: 'Series A' },
        { value: 'series_b', label: 'Series B' },
        { value: 'series_c', label: 'Series C' },
        { value: 'series_d', label: 'Series D' },
        { value: 'growth', label: 'Growth' },
        { value: 'bridge', label: 'Bridge' },
        { value: 'other', label: 'Other' },
      ], required: true },
      { key: 'target_amount', label: 'Target amount ($)', type: 'number' },
      { key: 'pre_money_valuation', label: 'Pre-money valuation ($)', type: 'number' },
      { key: 'price_per_share', label: 'Price per share ($, optional)', type: 'number' },
      { key: 'share_class_id', label: 'Share class', type: 'select', options: [{ value: '', label: 'Set at close' }] },
      { key: 'pool_target_pct', label: 'Pool target (% of post-money FD, optional)', type: 'number' },
    ],
  },
  Stakeholder: {
    title: 'Add stakeholder',
    sub: 'Adds a founder, employee, advisor, investor, or entity to the cap table.',
    url: '/api/cap/stakeholders',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: [
        { value: 'founder', label: 'Founder' },
        { value: 'employee', label: 'Employee' },
        { value: 'advisor', label: 'Advisor' },
        { value: 'consultant', label: 'Consultant' },
        { value: 'investor', label: 'Investor' },
        { value: 'entity', label: 'Entity' },
        { value: 'board_member', label: 'Board member' },
        { value: 'other', label: 'Other' },
      ], required: true },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'is_board', label: 'Board member', type: 'checkbox' },
      { key: 'is_insider', label: 'Insider', type: 'checkbox' },
    ],
  },
  'Share class': {
    title: 'New share class',
    sub: 'Creates a common or preferred class. Preferred classes carry the liquidation preference the waterfall uses.',
    url: '/api/cap/classes',
    fields: [
      { key: 'name', label: 'Class name', type: 'text', placeholder: 'Series A Preferred', required: true },
      { key: 'class_type', label: 'Type', type: 'select', options: [
        { value: 'common', label: 'Common' },
        { value: 'preferred', label: 'Preferred' },
      ], required: true },
      { key: 'authorized_shares', label: 'Authorized shares', type: 'number', required: true },
      { key: 'par_value', label: 'Par value ($)', type: 'number' },
      { key: 'liquidation_multiple', label: 'Liquidation multiple', type: 'number' },
      { key: 'participating', label: 'Participating', type: 'checkbox' },
      { key: 'seniority', label: 'Seniority (higher = paid first)', type: 'number' },
      { key: 'conversion_ratio', label: 'Conversion ratio', type: 'number' },
      { key: 'votes_per_share', label: 'Votes per share', type: 'number' },
    ],
  },
  'Option pool': {
    title: 'New option pool',
    sub: 'Creates an option pool against a share class. Grants draw down its authorized shares.',
    url: '/api/cap/plans',
    fields: [
      { key: 'name', label: 'Pool name', type: 'text', placeholder: '2025 Equity Incentive Plan', required: true },
      { key: 'share_class_id', label: 'Share class', type: 'select', options: [], required: true },
      { key: 'authorized_shares', label: 'Authorized shares', type: 'number', required: true },
      { key: 'adopted_on', label: 'Adopted on', type: 'date' },
    ],
  },
  '409A': {
    title: 'New 409A valuation',
    sub: 'Opens a valuation request — the cap table is snapshotted and the safe-harbor gate is checked. Work the request through inputs, comps, approaches, allocation, DLOM, and board adoption.',
    url: '/api/val/requests',
    fields: [
      { key: 'valuation_date', label: 'Valuation date', type: 'date', required: true },
      { key: 'method', label: 'Method', type: 'select', options: [
        { value: 'independent_appraisal', label: 'Independent appraisal' },
        { value: 'illiquid_startup', label: 'Illiquid startup' },
        { value: 'formula', label: 'Formula' },
        { value: 'other', label: 'Other' },
      ], required: true },
      { key: 'purpose', label: 'Purpose', type: 'select', options: [
        { value: 'option_grant_fmv', label: 'Option grant FMV' },
        { value: 'rsa_purchase_price', label: 'RSA purchase price' },
        { value: 'financial_reporting_asc718', label: 'Financial reporting (ASC 718)' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'provider_name', label: 'Provider', type: 'text', placeholder: 'Armanino LLP' },
      { key: 'qualified_individual_id', label: 'Qualified individual / appraiser', type: 'select', options: [] },
    ],
  },
  Document: {
    title: 'Add document',
    sub: 'Records a charter, consent, agreement, or plan document against the cap table.',
    url: '/api/cap/documents',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'document_type', label: 'Type', type: 'select', options: [
        { value: 'charter', label: 'Charter' },
        { value: 'bylaws', label: 'Bylaws' },
        { value: 'board_consent', label: 'Board consent' },
        { value: 'stockholder_consent', label: 'Stockholder consent' },
        { value: 'stock_purchase_agreement', label: 'Stock purchase agreement' },
        { value: 'safe', label: 'SAFE' },
        { value: 'convertible_note', label: 'Convertible note' },
        { value: '409a_report', label: '409A report' },
        { value: 'equity_plan', label: 'Equity plan' },
        { value: 'grant_agreement', label: 'Grant agreement' },
        { value: 'exercise_notice', label: 'Exercise notice' },
        { value: '83b_election', label: '83(b) election' },
        { value: 'side_letter', label: 'Side letter' },
        { value: 'other', label: 'Other' },
      ], required: true },
      { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'draft', label: 'Draft' },
        { value: 'out_for_signature', label: 'Out for signature' },
        { value: 'signed', label: 'Signed' },
        { value: 'void', label: 'Void' },
      ] },
      { key: 'signed_on', label: 'Signed on', type: 'date' },
      { key: 'file_url', label: 'File URL (optional)', type: 'text' },
    ],
  },
  Approval: {
    title: 'Record board approval',
    sub: 'Records a board approval. Adoption of a 409A report requires one of type valuation_adopt.',
    url: '/api/cap/approvals',
    fields: [
      { key: 'approval_type', label: 'Type', type: 'select', options: [
        { value: 'plan_adopt', label: 'Plan adoption' },
        { value: 'pool_increase', label: 'Pool increase' },
        { value: 'grant_batch', label: 'Grant batch' },
        { value: 'issuance', label: 'Issuance' },
        { value: 'valuation_adopt', label: 'Valuation adoption' },
        { value: 'financing', label: 'Financing' },
        { value: 'qualified_individual', label: 'Qualified individual' },
        { value: 'other', label: 'Other' },
      ], required: true },
      { key: 'adopted_on', label: 'Adopted on', type: 'date', required: true },
      { key: 'approval_method', label: 'Method', type: 'select', options: [
        { value: 'written_consent', label: 'Written consent' },
        { value: 'meeting', label: 'Meeting' },
      ] },
      { key: 'signer_stakeholder_ids', label: 'Signer', type: 'select', options: [{ value: '', label: 'No signer on file' }] },
      { key: 'summary', label: 'Summary', type: 'text' },
    ],
  },
};

function CapCreateDrawer({
  kind,
  prefill,
  state,
  onClose,
  onDone,
  onToast,
}: {
  kind: string;
  prefill?: Record<string, string>;
  state: CapState;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const def = CREATE_DEFS[kind];
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    ...(prefill ?? {}),
    ...(kind === 'Option grant' ? { vesting_months: '48', cliff_months: '12', grant_type: 'iso' } : {}),
    ...(kind === 'Share issuance' ? { issue_date: today(), consideration: 'cash' } : {}),
    ...(kind === 'SAFE' ? { issued_on: today(), instrument: 'safe_post_money' } : {}),
    ...(kind === '409A' ? { valuation_date: today(), method: 'independent_appraisal', purpose: 'option_grant_fmv' } : {}),
    ...(kind === 'Approval' ? { adopted_on: today(), approval_method: 'written_consent' } : {}),
    ...(kind === 'Document' ? { status: 'draft' } : {}),
    ...(kind === 'Round' ? { round_type: 'seed', status: 'planned' } : {}),
    ...(kind === 'Share class' ? { class_type: 'common', par_value: '0.0001', liquidation_multiple: '1', conversion_ratio: '1', votes_per_share: '1', seniority: '0' } : {}),
    ...(kind === 'Stakeholder' ? { type: 'founder' } : {}),
  }));
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== 'Share issuance' && kind !== 'SAFE') return;
    void fetchJson<{ data: { id: string; name: string; institution_name?: string }[] }>('/api/bank-accounts').then((res) => {
      if (res.ok) setBankAccounts(res.data.data.map((a) => ({ id: a.id, name: `${a.name}${a.institution_name ? ` · ${a.institution_name}` : ''}` })));
    });
  }, [kind]);

  if (!def) return null;

  const optionsFor = (key: string): { value: string; label: string }[] => {
    if (key === 'stakeholder_id') return state.stakeholders.map((s) => ({ value: s.id, label: s.name }));
    if (key === 'class_id' || key === 'share_class_id') return state.classes.map((c) => ({ value: c.id, label: `${c.name} (${c.classType})` }));
    if (key === 'pool_id') return state.pools.map((p) => ({ value: p.id, label: `${p.name} — ${numFmt(p.available)} available` }));
    if (key === 'bank_account_id') return bankAccounts.map((a) => ({ value: a.id, label: a.name }));
    if (key === 'signer_stakeholder_ids') return state.stakeholders.map((s) => ({ value: s.id, label: s.name }));
    if (key === 'qualified_individual_id') return state.qualifiedIndividuals.map((q) => ({ value: q.id, label: `${q.fullName}${q.firm ? ` (${q.firm})` : ''}${q.isIndependent ? ' — independent' : ''}` }));
    return [];
  };

  const set = (key: string, v: string | boolean) => setValues((prev) => ({ ...prev, [key]: v }));

  const submit = async () => {
    setError(null);
    for (const f of def.fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === '')) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    const payload: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = values[f.key];
      if (v === undefined || v === '') continue;
      if (f.type === 'number') payload[f.key] = Number(v);
      else if (f.key === 'signer_stakeholder_ids') payload[f.key] = [String(v)];
      else payload[f.key] = v;
    }
    if (kind === 'Share issuance') payload.kind = 'share';
    if (kind === 'SAFE') {
      payload.kind = payload.instrument === 'convertible_note' ? 'convertible_note' : 'safe';
      if (payload.discount_pct != null) payload.discount_rate = Number(payload.discount_pct) / 100;
      delete payload.discount_pct;
    }
    if (kind === 'Round' && payload.pool_target_pct != null) payload.pool_target_pct = Number(payload.pool_target_pct) / 100;
    setSaving(true);
    const res = await fetchJson<{ data: unknown }>(def.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Save failed.');
      return;
    }
    onToast(`${def.title} saved`);
    onDone();
    onClose();
  };

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>{def.title}</div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className={styles.drawerSub}>{def.sub}</p>
        {kind === 'Option grant' && state.activeFmv && (
          <div className={styles.drawerHint}>
            Active 409A FMV: {money(state.activeFmv.fmvPerShare)}/share (effective {state.activeFmv.effectiveDate}). Grants below FMV are rejected.
          </div>
        )}
        {def.fields.map((f) => {
          const dyn = optionsFor(f.key);
          const opts =
            f.key === 'bank_account_id'
              ? [{ value: '', label: 'No bank account — no journal posted' }, ...dyn]
              : dyn.length > 0
                ? [...(f.options ?? []).filter((o) => o.value === ''), ...dyn]
                : (f.options ?? []);
          if (f.type === 'checkbox') {
            return (
              <label key={f.key} className={styles.drawerCheck}>
                <input type="checkbox" checked={Boolean(values[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            );
          }
          return (
            <div key={f.key} className={styles.drawerField}>
              <label className={styles.fieldLabel}>{f.label}</label>
              {f.type === 'select' ? (
                <select
                  className={styles.fieldSelect}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">Select…</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.fieldInput}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={String(values[f.key] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          );
        })}
        {error && <div className={styles.drawerError}>{error}</div>}
        <div className={styles.drawerActions}>
          <button type="button" className={styles.btnPrimary} onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanySetupCard({
  state,
  onDone,
  onToast,
}: {
  state: CapState;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState(state.company.name ?? '');
  const [stateOfInc, setStateOfInc] = useState('Delaware');
  const [incorporatedOn, setIncorporatedOn] = useState('');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('12-31');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!stateOfInc.trim() || !incorporatedOn) {
      setError('State of incorporation and incorporation date are required.');
      return;
    }
    setSaving(true);
    const res = await fetchJson('/api/cap/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || undefined, state_of_incorporation: stateOfInc.trim(), incorporated_on: incorporatedOn, fiscal_year_end: fiscalYearEnd }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Save failed.');
      return;
    }
    onToast('Company profile saved');
    onDone();
  };

  return (
    <div className={styles.bannerWarn}>
      <div className={styles.cardTitleMb2}>No issuer profile on file</div>
      <p className={styles.cardMeta11}>
        The cap table has no company profile yet — set one up before issuing shares. The name is stored on the entity; incorporation details on the issuer profile.
      </p>
      <div className={styles.drawerFieldRow} style={{ marginTop: 10 }}>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Company name</label>
          <input className={styles.fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Unsaid" />
        </div>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>State of incorporation</label>
          <input className={styles.fieldInput} value={stateOfInc} onChange={(e) => setStateOfInc(e.target.value)} />
        </div>
      </div>
      <div className={styles.drawerFieldRow}>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Incorporated on</label>
          <input className={styles.fieldInput} type="date" value={incorporatedOn} onChange={(e) => setIncorporatedOn(e.target.value)} />
        </div>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Fiscal year end (MM-DD)</label>
          <input className={styles.fieldInput} value={fiscalYearEnd} onChange={(e) => setFiscalYearEnd(e.target.value)} />
        </div>
      </div>
      {error && <div className={styles.drawerError}>{error}</div>}
      <button type="button" className={styles.btnPrimary} onClick={() => void save()} disabled={saving}>
        {saving ? 'Saving…' : 'Save company profile'}
      </button>
    </div>
  );
}

function CapOverviewView({
  state,
  onGotoScreen,
  onCapCreate,
  onOpenCreateFlyout,
  onToast,
  onRefresh,
}: {
  state: CapState;
  onGotoScreen: (screenId: string) => void;
  onCapCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}) {
  const totalFds = state.company.fullyDiluted;
  const closedRounds = state.rounds.filter((r) => r.status === 'closed');
  const latestClosed = closedRounds[0] ?? null;
  const postMoney =
    latestClosed && latestClosed.preMoney != null && latestClosed.targetAmount != null
      ? latestClosed.preMoney + latestClosed.targetAmount
      : null;
  const totalRaised =
    state.issuances.reduce((s, i) => s + i.amount, 0) +
    state.safes.filter((s) => s.status === 'outstanding').reduce((s, x) => s + x.principal, 0);

  const kpis = [
    {
      label: 'Fully diluted shares',
      value: numFmt(totalFds),
      delta: `of ${numFmt(state.company.authorized)} authorized`,
    },
    {
      label: 'Post-money valuation',
      value: postMoney != null ? money0(postMoney) : '—',
      delta: latestClosed ? `${latestClosed.name} · ${latestClosed.closedOn ?? ''}` : 'No closed round yet',
    },
    {
      label: 'Total raised',
      value: money0(totalRaised),
      delta: `${state.rounds.length} round${state.rounds.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Option pool available',
      value: numFmt(state.optionPool.available),
      delta: `${numFmt(state.optionPool.granted)} granted`,
    },
  ];

  const createActions: [string, string][] = [
    ['Share issuance', 'add_card'],
    ['Option grant', 'workspace_premium'],
    ['SAFE', 'description'],
    ['Round', 'trending_up'],
    ['Stakeholder', 'person_add'],
    ['Share class', 'category'],
    ['Option pool', 'pie_chart'],
  ];

  const classTypeOf = (name: string) => state.classes.find((c) => c.name === name)?.classType ?? '';
  const getBarFillClass = (shareClass: string, kind: string) => {
    if (kind === 'unallocated_pool') return styles.fillQbMaroon;
    const t = classTypeOf(shareClass);
    if (t === 'preferred') return styles.fillQbGreen;
    if (t === 'common') return styles.fillQbBlue;
    return styles.fillQbTeal;
  };

  const fmvDaysLeft = state.activeFmv
    ? Math.ceil((new Date(state.activeFmv.expiresOn).getTime() - Date.now()) / 86400000)
    : null;

  const exportOverview = () => {
    exportToCsv(
      state.holders.map((h) => ({
        holder: h.name,
        class: h.shareClass,
        shares: h.shares,
        options: h.options,
        fully_diluted: h.fullyDiluted,
        fd_pct: h.pctFullyDiluted.toFixed(2),
      })),
      [
        { key: 'holder', label: 'Holder' },
        { key: 'class', label: 'Class' },
        { key: 'shares', label: 'Shares' },
        { key: 'options', label: 'Options' },
        { key: 'fully_diluted', label: 'Fully diluted' },
        { key: 'fd_pct', label: 'FD %' },
      ],
      `cap-table-${state.asOf}.csv`,
    );
    onToast('Cap table exported');
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Cap Table</span>
        </div>
        <div className={styles.headerRowBetween}>
          <div>
            <h1 className={styles.title}>Cap Table — Overview</h1>
            <p className={styles.subtitle}>
              {state.company.name ?? 'Company not set up'} · {state.company.stateOfIncorporation ? `${state.company.stateOfIncorporation} · ` : ''}As of {state.asOf}
            </p>
          </div>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.btnOutline} onClick={exportOverview}>
              <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
              Export
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() =>
                navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => onToast('Share link copied to clipboard'))
                  .catch(() => onToast('Copy failed — copy manually'))
              }
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>share</span>
              Share
            </button>
          </div>
        </div>
      </div>

      {!state.company.profileId && (
        <CompanySetupCard state={state} onDone={onRefresh} onToast={onToast} />
      )}

      <div className={styles.kpiGrid4}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.kpiCard4}>
            <span className={styles.kpiLabel4}>{k.label}</span>
            <div className={styles.kpiValue4}>{k.value}</div>
            <div className={styles.kpiSub4}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className={styles.grid3}>
        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <div className={styles.cardHeaderBetween}>
            <h2 className={styles.cardTitle}>Ownership breakdown</h2>
            <span className={styles.cardMeta11}>
              Fully diluted · {numFmt(totalFds)} shares
            </span>
          </div>
          {state.holders.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No shares issued yet</div>
              Issue founder shares to see the ownership breakdown.
            </div>
          ) : (
            <div className={styles.barList}>
              {state.holders.map((h) => {
                const pct = totalFds > 0 ? (h.fullyDiluted / totalFds) * 100 : 0;
                return (
                  <div key={`${h.stakeholderId ?? 'pool'}-${h.shareClass}`} className={styles.barRow}>
                    <span className={styles.barHolder}>{h.name}</span>
                    <div className={styles.barTrack}>
                      <svg className={styles.barSvg} aria-hidden="true">
                        <rect
                          className={getBarFillClass(h.shareClass, h.kind)}
                          x="0"
                          y="0"
                          width={`${pct.toFixed(1)}%`}
                          height="20"
                        />
                      </svg>
                    </div>
                    <span className={styles.barPct}>{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.legendRow}>
            <span className={styles.legendItem}>
              <span className={styles.dotBlue} />
              Common
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotGreen} />
              Preferred
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotMaroon} />
              Options
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotTeal} />
              SAFE
            </span>
          </div>
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Round history</h2>
          {state.rounds.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No rounds yet</div>
              Create a round to track a financing.
            </div>
          ) : (
            <div className={styles.roundHistoryList}>
              {state.rounds.map((r) => (
                <div key={r.id} className={styles.roundHistoryItem}>
                  <span className={`material-symbols-outlined ${styles.icon16PrimaryTop}`}>
                    {r.status === 'closed' ? 'check_circle' : 'pending'}
                  </span>
                  <div className={styles.roundHistoryBody}>
                    <div className={styles.roundHistoryTop}>
                      <span className={styles.roundHistoryName}>{r.name}</span>
                      <span className={styles.roundHistoryAmt}>
                        {r.targetAmount != null ? money0(r.targetAmount) : '—'}
                      </span>
                    </div>
                    <div className={styles.roundHistoryMeta}>
                      {r.closedOn ?? 'Not closed'} · {r.type} · {r.lead ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={styles.btnOutlineFullMt3} onClick={() => onGotoScreen('cap-rounds')}>
            View all rounds
          </button>
        </div>
      </div>

      <div className={styles.createActionsRow}>
        <span className={styles.createActionsLabel}>Create actions:</span>
        {createActions.map(([label, icon]) => (
          <button key={label} type="button" className={styles.createActionChip} onClick={() => onCapCreate(label)}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>{icon}</span>
            {label}
          </button>
        ))}
        <button type="button" className={styles.showAllChip} onClick={onOpenCreateFlyout}>
          <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
          Show all
        </button>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb2}>Recent equity events</h2>
          {state.events.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No events yet</div>
              Issuances, grants, and exercises are recorded here automatically.
            </div>
          ) : (
            <div className={styles.divideList}>
              {state.events.slice(0, 5).map((e) => (
                <div key={e.id} className={styles.recentEventRow}>
                  <div className={styles.recentEventLeft}>
                    <div className={styles.recentEventTitle}>{e.eventType}</div>
                    <div className={styles.recentEventSub}>
                      {e.date} · {e.holder ?? '—'}
                    </div>
                  </div>
                  <span className={styles.recentEventDelta}>
                    {e.shares != null ? `+${numFmt(e.shares)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb2}>Compliance &amp; reminders</h2>
          <div className={styles.complianceList}>
            {state.activeFmv ? (
              <div className={fmvDaysLeft != null && fmvDaysLeft < 60 ? styles.complianceError : styles.complianceNeutral}>
                <span className={`material-symbols-outlined ${styles.icon16Error}`}>warning</span>
                <span>
                  409A FMV {money(state.activeFmv.fmvPerShare)}/share expires {state.activeFmv.expiresOn}
                  {fmvDaysLeft != null ? ` — ${fmvDaysLeft} day${fmvDaysLeft === 1 ? '' : 's'} left` : ''}.
                </span>
              </div>
            ) : (
              <div className={styles.complianceError}>
                <span className={`material-symbols-outlined ${styles.icon16Error}`}>warning</span>
                <span>No final 409A valuation on file — open one before granting options at a strike.</span>
              </div>
            )}
            <div className={state.ledger.valid ? styles.complianceNeutral : styles.complianceError}>
              <span className={`material-symbols-outlined ${styles.icon16Secondary}`}>check_circle</span>
              <span>
                {state.ledger.valid
                  ? `Event ledger verified — ${state.ledger.eventsChecked} events, hash chain intact.`
                  : `Event ledger BROKEN at seq ${state.ledger.firstBrokenSeq}.`}
              </span>
            </div>
            <div className={styles.complianceNeutral}>
              <span className={`material-symbols-outlined ${styles.icon16Tertiary}`}>info</span>
              <span>
                {state.controls.length === 0
                  ? 'No open control findings.'
                  : `${state.controls.length} control finding${state.controls.length === 1 ? '' : 's'} — see Controls.`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapTableMainView({
  state,
  asOf,
  onAsOfChange,
  onOpenPeek,
  onCapCreate,
  onToast,
}: {
  state: CapState;
  asOf: string;
  onAsOfChange: (date: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onToast: (msg: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'summary' | 'detailed' | 'fds'>('summary');
  const [activeTab, setActiveTab] = useState<string>('All');
  const [filterText, setFilterText] = useState('');

  const safeByHolder = new Map<string, number>();
  for (const s of state.safes) {
    if (s.status !== 'outstanding') continue;
    safeByHolder.set(s.stakeholderId, (safeByHolder.get(s.stakeholderId) ?? 0) + s.principal);
  }
  const classTypeByName = new Map(state.classes.map((c) => [c.name, c.classType]));

  type Row = {
    key: string;
    stakeholderId: string | null;
    name: string;
    role: string;
    type: string;
    shares: number;
    options: number;
    optionsVested: number;
    safe: number;
    invested: number;
    fds: number;
    fdsPct: string;
  };
  const rows: Row[] = state.holders.map((h) => ({
    key: `${h.stakeholderId ?? 'pool'}-${h.shareClass}`,
    stakeholderId: h.stakeholderId,
    name: h.name,
    role: h.role,
    type: h.kind === 'unallocated_pool' ? 'Options' : h.shareClass,
    shares: h.shares,
    options: h.options,
    optionsVested: h.optionsVested,
    safe: h.stakeholderId ? safeByHolder.get(h.stakeholderId) ?? 0 : 0,
    invested: h.invested,
    fds: h.fullyDiluted,
    fdsPct: pctFmt(h.pctFullyDiluted),
  }));
  // SAFE-only holders have no cap-table row; show them under SAFE/Convertible.
  for (const [sid, principal] of safeByHolder) {
    if (rows.some((r) => r.stakeholderId === sid)) continue;
    const holder = state.stakeholders.find((s) => s.id === sid);
    rows.push({
      key: `safe-${sid}`,
      stakeholderId: sid,
      name: holder?.name ?? 'Unknown holder',
      role: holder?.type ?? '',
      type: 'SAFE',
      shares: 0,
      options: 0,
      optionsVested: 0,
      safe: principal,
      invested: principal,
      fds: 0,
      fdsPct: '0.00%',
    });
  }

  const totalFds = state.company.fullyDiluted;
  const totalShares = rows.reduce((s, r) => s + r.shares, 0);
  const totalOptions = rows.reduce((s, r) => s + r.options, 0);
  const totalSafe = rows.reduce((s, r) => s + r.safe, 0);
  const totalInvested = rows.reduce((s, r) => s + r.invested, 0);

  const q = filterText.trim().toLowerCase();
  const filteredHolders = rows.filter((h) => {
    if (activeTab === 'Common' && classTypeByName.get(h.type) !== 'common') return false;
    if (activeTab === 'Preferred' && classTypeByName.get(h.type) !== 'preferred') return false;
    if (activeTab === 'Options' && h.options === 0 && h.type !== 'Options') return false;
    if (activeTab === 'SAFE/Convertible' && h.safe === 0) return false;
    if (!q) return true;
    return h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q) || h.type.toLowerCase().includes(q);
  });

  const kpiCards: [string, string][] = [
    ['Authorized', numFmt(state.company.authorized)],
    ['Issued', numFmt(state.company.issued)],
    ['Outstanding', numFmt(totalShares)],
    ['Fully diluted', numFmt(totalFds)],
    ['Par value', state.company.parValue != null ? `$${state.company.parValue.toFixed(4)}` : '—'],
  ];
  const tabs = ['All', 'Common', 'Preferred', 'Options', 'SAFE/Convertible'];

  const showDetailed = viewMode === 'detailed';
  const showFds = viewMode === 'fds';

  const exportTable = () => {
    exportToCsv(
      filteredHolders.map((h) => ({
        holder: h.name,
        security: h.type,
        shares: h.shares,
        ownership_pct: totalShares > 0 ? ((h.shares / totalShares) * 100).toFixed(2) : '0.00',
        options: h.options,
        options_vested: h.optionsVested,
        safe_usd: h.safe,
        invested_usd: h.invested,
        fully_diluted: h.fds,
        fd_pct: h.fdsPct,
      })),
      [
        { key: 'holder', label: 'Holder' },
        { key: 'security', label: 'Security' },
        { key: 'shares', label: 'Shares' },
        { key: 'ownership_pct', label: 'Ownership %' },
        { key: 'options', label: 'Options' },
        { key: 'options_vested', label: 'Options vested' },
        { key: 'safe_usd', label: 'SAFE $' },
        { key: 'invested_usd', label: 'Invested $' },
        { key: 'fully_diluted', label: 'Fully diluted' },
        { key: 'fd_pct', label: 'FD %' },
      ],
      `cap-table-${state.asOf}.csv`,
    );
    onToast('Cap table exported');
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Cap Table</h1>
          <p className={styles.subtitle}>
            {state.company.name ?? 'Company not set up'} · As of {state.asOf}
            {state.company.stateOfIncorporation ? ` · ${state.company.stateOfIncorporation}` : ''}
          </p>
        </div>
        <div className={styles.actionsRow}>
          <div className={styles.viewToggle} id="cap-view-toggle">
            {(
              [
                ['summary', 'Summary'],
                ['detailed', 'Detailed'],
                ['fds', 'Fully diluted'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-capview={key}
                className={`${styles.viewToggleBtn} ${viewMode === key ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.btnOutline} onClick={exportTable}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => onToast('Share link copied'))
                .catch(() => onToast('Copy failed — copy manually'))
            }
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>share</span>
            Share
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid5}>
        {kpiCards.map(([label, val]) => (
          <div key={label} className={styles.kpiCard5}>
            <span className={styles.kpiLabel5}>{label}</span>
            <div className={styles.kpiValue5}>{val}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableCardShadow}>
        <div className={styles.tabsBar}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabUnderline} ${activeTab === tab ? styles.tabUnderlineActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>search</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter stakeholders…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <label className={styles.fieldLabel} style={{ margin: 0 }}>
            As-of
          </label>
          <input
            type="date"
            className={styles.fieldInput}
            style={{ maxWidth: 150 }}
            value={asOf}
            onChange={(e) => onAsOfChange(e.target.value)}
          />
          <span className={styles.filterCountRight}>{filteredHolders.length} stakeholders</span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.tableWide}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>Stakeholder</th>
                <th className={styles.th}>Security</th>
                {!showFds && <th className={styles.thRight}>Shares</th>}
                {!showFds && <th className={styles.thRight}>Ownership</th>}
                {!showFds && <th className={styles.thRight}>Options</th>}
                {showDetailed && <th className={styles.thRight}>Options vested</th>}
                {showDetailed && <th className={styles.thRight}>SAFE ($)</th>}
                {showDetailed && <th className={styles.thRight}>Invested</th>}
                <th className={styles.thRight}>Fully diluted</th>
                <th className={styles.thRight}>FD %</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {filteredHolders.map((h, idx) => {
                const pct = totalShares > 0 ? (h.shares / totalShares) * 100 : 0;
                return (
                  <tr key={h.key} className={styles.trClick} onClick={() => onOpenPeek(toDemoRow(h), 'cap')}>
                    <td className={styles.tdMuted}>{idx + 1}</td>
                    <td className={styles.td}>
                      <div className={styles.holderPrimary}>{h.name}</div>
                      <div className={styles.holderSecondary}>{h.role}</div>
                    </td>
                    <td className={styles.td}>
                      <StatusPill status={h.type} />
                    </td>
                    {!showFds && <td className={styles.tdRight}>{numFmt(h.shares)}</td>}
                    {!showFds && <td className={styles.tdRight}>{pct.toFixed(2)}%</td>}
                    {!showFds && <td className={styles.tdRight}>{numFmt(h.options)}</td>}
                    {showDetailed && <td className={styles.tdRight}>{numFmt(h.optionsVested)}</td>}
                    {showDetailed && <td className={styles.tdRight}>{h.safe ? money0(h.safe) : '—'}</td>}
                    {showDetailed && <td className={styles.tdRight}>{h.invested ? money0(h.invested) : '—'}</td>}
                    <td className={styles.tdRightMedium}>{numFmt(h.fds)}</td>
                    <td className={styles.tdRightSemi}>{h.fdsPct}</td>
                    <td className={styles.tdAction}>
                      <button
                        type="button"
                        className={styles.rowIconBtn}
                        title="Issue shares to this holder"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (h.stakeholderId) onCapCreate('Share issuance', { stakeholder_id: h.stakeholderId });
                          else onToast('Unallocated pool — issue shares to a stakeholder instead');
                        }}
                      >
                        <span className={`material-symbols-outlined ${styles.icon16Muted}`}>add_card</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredHolders.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={11}>
                    No holders match — issue shares to see the cap table.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className={styles.tfoot}>
              <tr>
                <td className={styles.td} colSpan={3}>Totals</td>
                {!showFds && <td className={styles.tdRight}>{numFmt(totalShares)}</td>}
                {!showFds && <td className={styles.tdRight}>100.00%</td>}
                {!showFds && <td className={styles.tdRight}>{numFmt(totalOptions)}</td>}
                {showDetailed && <td className={styles.tdRight}>{numFmt(rows.reduce((s, r) => s + r.optionsVested, 0))}</td>}
                {showDetailed && <td className={styles.tdRight}>{money0(totalSafe)}</td>}
                {showDetailed && <td className={styles.tdRight}>{money0(totalInvested)}</td>}
                <td className={styles.tdRight}>{numFmt(totalFds)}</td>
                <td className={styles.tdRight}>100.00%</td>
                <td className={styles.td} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapHoldersView({
  state,
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const holderAgg = new Map(state.holders.map((h) => [h.stakeholderId ?? '', h]));
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Stakeholders</h1>
          <p className={styles.subtitle}>Founders, investors, option holders, SAFE holders.</p>
        </div>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => {
              exportToCsv(
                state.stakeholders.map((s) => ({ name: s.name, type: s.type, email: s.email ?? '' })),
                [
                  { key: 'name', label: 'Name' },
                  { key: 'type', label: 'Type' },
                  { key: 'email', label: 'Email' },
                ],
                `stakeholders-${state.asOf}.csv`,
              );
              onToast('Stakeholders exported');
            }}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('Stakeholder')}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>person_add</span>
            Add stakeholder
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Security</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Invested</th>
                <th className={styles.thRight}>FD %</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.stakeholders.map((s) => {
                const agg = holderAgg.get(s.id);
                return (
                  <tr key={s.id} className={styles.trClick} onClick={() => onOpenPeek(toDemoRow({ name: s.name, role: s.type, email: s.email ?? '' }), 'cap')}>
                    <td className={styles.tdMedium}>{s.name}</td>
                    <td className={styles.td}>{s.type}</td>
                    <td className={styles.td}>
                      <StatusPill status={agg?.shareClass ?? '—'} />
                    </td>
                    <td className={styles.tdRight}>{agg ? numFmt(agg.shares) : '—'}</td>
                    <td className={styles.tdRight}>{agg && agg.invested ? money0(agg.invested) : '—'}</td>
                    <td className={styles.tdRight}>{agg ? pctFmt(agg.pctFullyDiluted) : '—'}</td>
                    <td className={styles.td}>
                      <StatusPill status="Active" />
                    </td>
                    <td className={styles.tdAction}>
                      <button
                        type="button"
                        className={styles.rowIconBtn}
                        title="Issue shares to this holder"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCapCreate('Share issuance', { stakeholder_id: s.id });
                        }}
                      >
                        <span className={`material-symbols-outlined ${styles.icon16Muted}`}>add_card</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {state.stakeholders.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={8}>No stakeholders yet — add one to start the cap table.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CloseRoundForm({
  roundId,
  roundName,
  state,
  onClose,
  onDone,
  onToast,
}: {
  roundId: string;
  roundName: string;
  state: CapState;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const [closeDate, setCloseDate] = useState(today());
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [investments, setInvestments] = useState<{ stakeholder_id: string; amount: string }[]>([{ stakeholder_id: '', amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{ data: { id: string; name: string; institution_name?: string }[] }>('/api/bank-accounts').then((res) => {
      if (res.ok) setBankAccounts(res.data.data.map((a) => ({ id: a.id, name: `${a.name}${a.institution_name ? ` · ${a.institution_name}` : ''}` })));
    });
  }, []);

  const close = async () => {
    setError(null);
    const rows = investments.filter((i) => i.stakeholder_id && Number(i.amount) > 0);
    if (rows.length === 0) {
      setError('Add at least one investor with a positive amount.');
      return;
    }
    setSaving(true);
    const res = await fetchJson(`/api/cap/rounds/${roundId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investments: rows.map((i) => ({ stakeholder_id: i.stakeholder_id, amount: Number(i.amount) })),
        close_date: closeDate,
        bank_account_id: bankAccountId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Close failed.');
      return;
    }
    onToast(`${roundName} closed — shares issued, SAFEs converted`);
    onDone();
    onClose();
  };

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>Close {roundName}</div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className={styles.drawerSub}>
          Prices the round from the model, issues investor shares, converts outstanding SAFEs and notes, and posts the journals to the bank account when one is given.
        </p>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Close date</label>
          <input className={styles.fieldInput} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Bank account (cash deposit)</label>
          <select className={styles.fieldSelect} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">No bank account — journals post without a cash leg</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Investments</label>
          {investments.map((inv, idx) => (
            <div key={idx} className={styles.drawerFieldRow} style={{ marginBottom: 8 }}>
              <select className={styles.fieldSelect} value={inv.stakeholder_id} onChange={(e) => setInvestments((prev) => prev.map((p, i) => (i === idx ? { ...p, stakeholder_id: e.target.value } : p)))}>
                <option value="">Investor…</option>
                {state.stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input className={styles.fieldInput} type="number" placeholder="Amount $" value={inv.amount} onChange={(e) => setInvestments((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))} />
            </div>
          ))}
          <button type="button" className={styles.btnOutline} onClick={() => setInvestments((prev) => [...prev, { stakeholder_id: '', amount: '' }])}>
            Add investor
          </button>
        </div>
        {error && <div className={styles.drawerError}>{error}</div>}
        <div className={styles.drawerActions}>
          <button type="button" className={styles.btnPrimary} onClick={() => void close()} disabled={saving}>
            {saving ? 'Closing…' : 'Close round'}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CapRoundsView({
  state,
  onCapCreate,
  onRefresh,
  onToast,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onRefresh: () => void;
  onToast: (msg: string) => void;
}) {
  const [closingRound, setClosingRound] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Funding Rounds</h1>
          <p className={styles.subtitle}>SAFE, Seed, Series A — pre/post money, price per share, shares issued.</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('Round')}>
          <span className={`material-symbols-outlined ${styles.icon16}`}>trending_up</span>
          New round
        </button>
      </div>

      {state.rounds.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No rounds yet</div>
          Create a round to track a financing.
        </div>
      ) : (
        <div className={styles.grid3}>
          {state.rounds.map((r) => (
            <div key={r.id} className={styles.roundCard}>
              <div className={styles.cardHeaderBetweenMb2}>
                <h3 className={styles.cardTitle}>{r.name}</h3>
                <StatusPill status={r.status} />
              </div>
              <div className={styles.roundAmount}>{r.targetAmount != null ? money0(r.targetAmount) : '—'}</div>
              <dl className={styles.dlList}>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Date</dt>
                  <dd className={styles.dd}>{r.closedOn ?? 'Not closed'}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Type</dt>
                  <dd className={styles.dd}>{r.type}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Pre-money</dt>
                  <dd className={styles.dd}>{r.preMoney != null ? money0(r.preMoney) : '—'}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Post-money</dt>
                  <dd className={styles.dd}>{r.preMoney != null && r.targetAmount != null ? money0(r.preMoney + r.targetAmount) : '—'}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Price/share</dt>
                  <dd className={styles.dd}>{r.pricePerShare != null ? money(r.pricePerShare) : '—'}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Shares issued</dt>
                  <dd className={styles.dd}>{numFmt(r.sharesIssued)}</dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Lead</dt>
                  <dd className={styles.dd}>{r.lead ?? '—'}</dd>
                </div>
              </dl>
              {r.status !== 'closed' && r.status !== 'cancelled' && (
                <button
                  type="button"
                  className={styles.btnOutlineFullMt3}
                  onClick={() => setClosingRound({ id: r.id, name: r.name })}
                >
                  Close round
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {closingRound && (
        <CloseRoundForm
          roundId={closingRound.id}
          roundName={closingRound.name}
          state={state}
          onClose={() => setClosingRound(null)}
          onDone={onRefresh}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function CapOptionsView({
  state,
  onCapCreate,
  onOpenPeek,
  onToast,
  onOpenTransaction,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
  onOpenTransaction: (action: string, prefill?: Record<string, string>) => void;
}) {
  const p = state.optionPool;
  const kpiCards: [string, string][] = [
    ['Pool total', numFmt(p.total)],
    ['Granted', numFmt(p.granted)],
    ['Exercised', numFmt(p.exercised)],
    ['Available', numFmt(p.available)],
    ['Unvested', numFmt(p.unvested)],
  ];
  const vestingLabel = (months: number, cliff: number) =>
    months === 0 ? 'Immediate' : `${Math.round(months / 12)}yr / ${Math.round(cliff / 12)}yr cliff`;

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Option Pool</h1>
          <p className={styles.subtitle}>Grant, vest, exercise, cancel. ISO / NSO.</p>
        </div>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => {
              exportToCsv(
                state.grants.map((g) => ({ holder: g.holder, grant_date: g.grantDate, shares: g.shares, strike: g.strike, vested: g.vested, unvested: g.unvested, type: g.type, status: g.status })),
                [
                  { key: 'holder', label: 'Holder' },
                  { key: 'grant_date', label: 'Grant date' },
                  { key: 'shares', label: 'Shares' },
                  { key: 'strike', label: 'Strike' },
                  { key: 'vested', label: 'Vested' },
                  { key: 'unvested', label: 'Unvested' },
                  { key: 'type', label: 'Type' },
                  { key: 'status', label: 'Status' },
                ],
                `option-grants-${state.asOf}.csv`,
              );
              onToast('Grants exported');
            }}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('Option grant')}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>workspace_premium</span>
            New grant
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid5}>
        {kpiCards.map(([label, val]) => (
          <div key={label} className={styles.kpiCard5}>
            <span className={styles.kpiLabel5}>{label}</span>
            <div className={styles.kpiValue5}>{val}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Holder</th>
                <th className={styles.th}>Pool</th>
                <th className={styles.th}>Grant date</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Strike</th>
                <th className={styles.thRight}>Vested</th>
                <th className={styles.thRight}>Unvested</th>
                <th className={styles.th}>Vesting</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.grants.map((g) => (
                <tr
                  key={g.id}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow({ holder: g.holder, grantDate: g.grantDate, shares: g.shares, strike: g.strike, vested: g.vested, unvested: g.unvested, type: g.type, status: g.status }), 'cap')}
                >
                  <td className={styles.tdMedium}>{g.holder}</td>
                  <td className={styles.td}>{g.poolName}</td>
                  <td className={styles.td}>{g.grantDate}</td>
                  <td className={styles.tdRight}>{numFmt(g.shares)}</td>
                  <td className={styles.tdRight}>{money(g.strike)}</td>
                  <td className={styles.tdRight}>{numFmt(g.vested)}</td>
                  <td className={styles.tdRight}>{numFmt(g.unvested)}</td>
                  <td className={styles.tdSmall}>{vestingLabel(g.vestingMonths, g.cliffMonths)}</td>
                  <td className={styles.td}>{g.type.toUpperCase()}</td>
                  <td className={styles.td}>
                    <StatusPill status={g.status} />
                  </td>
                  <td className={styles.tdAction}>
                    {g.status === 'active' && g.vested > g.exercised && (
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTransaction('exercise', { grant_id: g.id, shares: String(g.vested - g.exercised) });
                        }}
                      >
                        Exercise
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {state.grants.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={11}>No grants yet — create an option pool, then grant from it.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type TxnAction = 'exercise' | 'cancel' | 'convert' | 'transfer' | 'repurchase' | 'split' | 'file83b';

function TransactionDrawer({
  action,
  prefill,
  state,
  onClose,
  onDone,
  onToast,
}: {
  action: TxnAction;
  prefill?: Record<string, string>;
  state: CapState;
  onClose: () => void;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const [act, setAct] = useState<TxnAction>(action);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    effective_date: today(),
    unvested_only: true,
    ...(prefill ?? {}),
  }));
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJson<{ data: { id: string; name: string; institution_name?: string }[] }>('/api/bank-accounts').then((res) => {
      if (res.ok) setBankAccounts(res.data.data.map((a) => ({ id: a.id, name: `${a.name}${a.institution_name ? ` · ${a.institution_name}` : ''}` })));
    });
  }, []);

  const set = (key: string, v: string | boolean) => setValues((prev) => ({ ...prev, [key]: v }));

  const fieldsFor = (a: TxnAction): FieldDef[] => {
    switch (a) {
      case 'exercise':
        return [
          { key: 'grant_id', label: 'Grant', type: 'select', options: state.grants.filter((g) => g.status === 'active').map((g) => ({ value: g.id, label: `${g.holder} — ${numFmt(g.shares)} @ ${money(g.strike)} (${numFmt(g.vested - g.exercised)} vested)` })), required: true },
          { key: 'shares', label: 'Shares to exercise', type: 'number', required: true },
          { key: 'effective_date', label: 'Exercised on', type: 'date', required: true },
          { key: 'bank_account_id', label: 'Bank account (cash received)', type: 'select', options: [{ value: '', label: 'No bank account' }, ...bankAccounts.map((b) => ({ value: b.id, label: b.name }))] },
        ];
      case 'cancel':
        return [
          { key: 'grant_id', label: 'Grant', type: 'select', options: state.grants.filter((g) => g.status === 'active').map((g) => ({ value: g.id, label: `${g.holder} — ${numFmt(g.shares)} (${numFmt(g.unvested)} unvested)` })), required: true },
          { key: 'reason', label: 'Reason', type: 'text' },
          { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
          { key: 'unvested_only', label: 'Unvested only', type: 'checkbox' },
        ];
      case 'convert':
        return [
          { key: 'convertible_id', label: 'SAFE / note', type: 'select', options: state.safes.filter((s) => s.status === 'outstanding').map((s) => ({ value: s.id, label: `${s.holder} — ${money0(s.principal)} ${s.instrument}` })), required: true },
          { key: 'stakeholder_id', label: 'Stakeholder', type: 'select', options: state.stakeholders.map((s) => ({ value: s.id, label: s.name })), required: true },
          { key: 'class_id', label: 'Share class', type: 'select', options: state.classes.map((c) => ({ value: c.id, label: `${c.name} (${c.classType})` })), required: true },
          { key: 'shares', label: 'Shares', type: 'number', required: true },
          { key: 'price_per_share', label: 'Price per share ($)', type: 'number', required: true },
          { key: 'effective_date', label: 'Conversion date', type: 'date', required: true },
          { key: 'round_id', label: 'Round (optional)', type: 'select', options: [{ value: '', label: 'No round' }, ...state.rounds.map((r) => ({ value: r.id, label: r.name }))] },
        ];
      case 'transfer':
        return [
          { key: 'issuance_id', label: 'Issuance', type: 'select', options: state.issuances.map((i) => ({ value: i.id, label: `${i.holderName} — ${numFmt(i.shares)} ${i.className}${i.certificateNo ? ` (${i.certificateNo})` : ''}` })), required: true },
          { key: 'to_stakeholder_id', label: 'Transfer to', type: 'select', options: state.stakeholders.map((s) => ({ value: s.id, label: s.name })), required: true },
          { key: 'shares', label: 'Shares (blank = all)', type: 'number' },
          { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
        ];
      case 'repurchase':
        return [
          { key: 'issuance_id', label: 'Issuance', type: 'select', options: state.issuances.map((i) => ({ value: i.id, label: `${i.holderName} — ${numFmt(i.shares)} ${i.className}${i.certificateNo ? ` (${i.certificateNo})` : ''}` })), required: true },
          { key: 'shares', label: 'Shares (blank = all)', type: 'number' },
          { key: 'amount', label: 'Amount paid ($, optional)', type: 'number' },
          { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
        ];
      case 'split':
        return [
          { key: 'split_multiplier', label: 'Split multiplier (e.g. 2 for 2:1)', type: 'number', required: true },
          { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
        ];
      case 'file83b':
        return [
          { key: 'issuance_id', label: 'Issuance (early-exercise shares)', type: 'select', options: state.issuances.map((i) => ({ value: i.id, label: `${i.holderName} — ${numFmt(i.shares)} ${i.className} (${i.issueDate})` })), required: true },
          { key: 'effective_date', label: 'Filed on', type: 'date', required: true },
          { key: 'document_id', label: 'Proof document id (optional)', type: 'text' },
        ];
    }
  };

  const titles: Record<TxnAction, string> = {
    exercise: 'Exercise options',
    cancel: 'Cancel options',
    convert: 'Convert SAFE / note',
    transfer: 'Transfer shares',
    repurchase: 'Repurchase shares',
    split: 'Stock split',
    file83b: 'Record 83(b) filing',
  };

  const submit = async () => {
    setError(null);
    const fields = fieldsFor(act);
    for (const f of fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === '')) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v === undefined || v === '') continue;
      payload[f.key] = f.type === 'number' ? Number(v) : v;
    }
    setSaving(true);
    const res = await fetchJson(`/api/cap/transactions/${act}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Transaction failed.');
      return;
    }
    onToast(`${titles[act]} recorded`);
    onDone();
    onClose();
  };

  const fields = fieldsFor(act);
  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>Record equity event</div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className={styles.drawerSub}>
          Events post to the immutable equity ledger (cap_equity_events) with a hash chain. Transfers and repurchases move ownership only — no journal is posted.
        </p>
        <div className={styles.drawerField}>
          <label className={styles.fieldLabel}>Action</label>
          <select className={styles.fieldSelect} value={act} onChange={(e) => setAct(e.target.value as TxnAction)}>
            {(Object.keys(titles) as TxnAction[]).map((a) => (
              <option key={a} value={a}>{titles[a]}</option>
            ))}
          </select>
        </div>
        {fields.map((f) => {
          if (f.type === 'checkbox') {
            return (
              <label key={f.key} className={styles.drawerCheck}>
                <input type="checkbox" checked={Boolean(values[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            );
          }
          return (
            <div key={f.key} className={styles.drawerField}>
              <label className={styles.fieldLabel}>{f.label}</label>
              {f.type === 'select' ? (
                <select className={styles.fieldSelect} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">Select…</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.fieldInput}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={String(values[f.key] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          );
        })}
        {error && <div className={styles.drawerError}>{error}</div>}
        <div className={styles.drawerActions}>
          <button type="button" className={styles.btnPrimary} onClick={() => void submit()} disabled={saving}>
            {saving ? 'Recording…' : 'Record'}
          </button>
          <button type="button" className={styles.btnOutline} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CapSafesView({
  state,
  onCapCreate,
  onOpenPeek,
  onToast,
  onOpenTransaction,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
  onOpenTransaction: (action: string, prefill?: Record<string, string>) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>SAFEs &amp; Convertibles</h1>
          <p className={styles.subtitle}>Valuation cap, discount, MFN, pro-rata. Convert on financing.</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('SAFE')}>
          <span className={`material-symbols-outlined ${styles.icon16}`}>description</span>
          New SAFE
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Holder</th>
                <th className={styles.th}>Date</th>
                <th className={styles.thRight}>Amount</th>
                <th className={styles.thRight}>Valuation cap</th>
                <th className={styles.th}>Discount</th>
                <th className={styles.th}>MFN</th>
                <th className={styles.th}>Pro-rata</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.safes.map((s) => (
                <tr
                  key={s.id}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow({ holder: s.holder, date: s.issuedOn, amount: s.principal, valuationCap: s.valuationCap, discount: s.discountRate, status: s.status }), 'cap')}
                >
                  <td className={styles.tdMedium}>{s.holder}</td>
                  <td className={styles.td}>{s.issuedOn}</td>
                  <td className={styles.tdRight}>{money0(s.principal)}</td>
                  <td className={styles.tdRight}>{s.valuationCap != null ? money0(s.valuationCap) : '—'}</td>
                  <td className={styles.td}>{s.discountRate != null ? `${(s.discountRate * 100).toFixed(0)}%` : '—'}</td>
                  <td className={styles.td}>{s.mfn ? 'Yes' : 'No'}</td>
                  <td className={styles.td}>{s.proRata ? 'Yes' : 'No'}</td>
                  <td className={styles.td}>
                    <StatusPill status={s.status} />
                  </td>
                  <td className={styles.tdAction}>
                    {s.status === 'outstanding' && (
                      <button
                        type="button"
                        className={styles.btnOutline}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTransaction('convert', { convertible_id: s.id, stakeholder_id: s.stakeholderId });
                        }}
                      >
                        Convert
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {state.safes.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={9}>No SAFEs or convertibles on file.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type ModelResult = {
  pre_money: number;
  investment: number;
  price_per_share: number;
  fully_diluted_before: number;
  pool_increase: number;
  conversion_shares: number;
  new_investor_shares: number;
  fully_diluted_after: number;
  post_money: number;
  new_investor_pct: number;
  pool_pct_after: number;
  conversions: { convertible_id: string; holder: string; instrument: string; amount: number; shares: number }[];
  existing_holders: { holder: string; kind: string; shares: number; pct_before: number; pct_after: number }[];
};

function CapDilutionView({ state, onToast }: { state: CapState; onToast: (msg: string) => void }) {
  const [roundName, setRoundName] = useState<string>('Series A Extension');
  const [amountInput, setAmountInput] = useState<string>('$3,000,000');
  const [preMoneyInput, setPreMoneyInput] = useState<string>('$30,000,000');
  const [poolPctInput, setPoolPctInput] = useState<string>('10');
  const [model, setModel] = useState<ModelResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunModel = async () => {
    setError(null);
    const amount = parseNumeric(amountInput, 0);
    const preMoney = parseNumeric(preMoneyInput, 0);
    const poolPct = parseNumeric(poolPctInput, 0) / 100;
    if (preMoney <= 0) {
      setError('Pre-money valuation must be positive.');
      return;
    }
    setRunning(true);
    const res = await fetchJson<{ data: ModelResult }>('/api/cap/model-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_money: preMoney, investment: amount, pool_target_pct: poolPct }),
    });
    setRunning(false);
    if (!res.ok) {
      setError(res.error ?? 'Model failed.');
      return;
    }
    setModel(res.data.data);
    onToast('Dilution model recalculated');
  };

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumbWizard}>
        <span>Cap Table</span>
      </div>
      <h1 className={styles.titleMb1}>Dilution Modeler</h1>
      <p className={styles.subtitleMb5}>
        Model new rounds, option pool increases, SAFE conversions, and price-per-share effects — computed by cap_model_round against the live table.
      </p>

      <div className={styles.grid3Gap4}>
        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <h2 className={styles.cardTitleMb3}>Model a new round</h2>
          <div className={styles.formGrid2}>
            <div>
              <label className={styles.fieldLabel}>Round name</label>
              <input className={styles.fieldInput} value={roundName} onChange={(e) => setRoundName(e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel}>Amount raised</label>
              <input className={styles.fieldInput} value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel}>Pre-money valuation</label>
              <input className={styles.fieldInput} value={preMoneyInput} onChange={(e) => setPreMoneyInput(e.target.value)} />
            </div>
            <div>
              <label className={styles.fieldLabel}>Option pool target (% of post-money FD)</label>
              <input className={styles.fieldInput} value={poolPctInput} onChange={(e) => setPoolPctInput(e.target.value)} />
            </div>
          </div>
          <button type="button" className={styles.btnPrimaryMb5} onClick={() => void handleRunModel()} disabled={running}>
            {running ? 'Running…' : 'Run model'}
          </button>
          {error && <div className={styles.drawerError}>{error}</div>}

          <h3 className={styles.subHeadingMb2}>Before / after ownership</h3>
          {model ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Holder</th>
                    <th className={styles.thRight}>Before</th>
                    <th className={styles.thRight}>After</th>
                    <th className={styles.thRight}>Δ</th>
                  </tr>
                </thead>
                <tbody className={styles.tbody}>
                  {model.existing_holders.map((h) => {
                    const delta = h.pct_after - h.pct_before;
                    return (
                      <tr key={`${h.holder}-${h.kind}`}>
                        <td className={styles.td}>{h.holder}</td>
                        <td className={styles.tdRight}>{h.pct_before.toFixed(2)}%</td>
                        <td className={styles.tdRight}>{h.pct_after.toFixed(2)}%</td>
                        <td className={delta < 0 ? styles.tdRightNeg : styles.tdRightPos}>
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className={styles.tdMedium}>New investors ({roundName})</td>
                    <td className={styles.tdRight}>—</td>
                    <td className={styles.tdRight}>{model.new_investor_pct.toFixed(2)}%</td>
                    <td className={styles.tdRightPos}>+{model.new_investor_pct.toFixed(2)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No model run yet</div>
              Run the model to see before/after ownership from the live cap table.
            </div>
          )}
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Conversion preview</h2>
          <div className={styles.previewStack}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>New price/share</span>
              <span className={styles.previewVal}>{model ? money(model.price_per_share) : '—'}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>New shares issued</span>
              <span className={styles.previewVal}>{model ? numFmt(model.new_investor_shares) : '—'}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>SAFE conversion</span>
              <span className={styles.previewVal}>{model ? numFmt(model.conversion_shares) : '—'}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Pool top-up</span>
              <span className={styles.previewVal}>{model ? numFmt(model.pool_increase) : '—'}</span>
            </div>
            <div className={styles.previewTotalRow}>
              <span className={styles.previewTotalText}>Post-money</span>
              <span className={styles.previewTotalText}>{model ? money0(model.post_money) : '—'}</span>
            </div>
          </div>
          <div className={styles.infoCallout}>
            <span className={`material-symbols-outlined ${styles.icon14Inline}`}>info</span>
            SAFE conversions apply cap and discount, whichever yields more shares. MFN holders get the best terms from later SAFEs.
          </div>
          {model && model.conversions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 className={styles.subHeadingMb2}>Conversions</h3>
              {model.conversions.map((c) => (
                <div key={c.convertible_id} className={styles.previewRow}>
                  <span className={styles.previewLabel}>{c.holder}</span>
                  <span className={styles.previewVal}>{numFmt(c.shares)} shares</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type WaterfallRow = {
  share_class: string;
  stakeholder_id: string | null;
  holder_name: string;
  shares: number;
  preference: number;
  participation: number;
  total_payout: number;
  per_share: number;
  converted: boolean;
};

function CapWaterfallView({ state, onToast }: { state: CapState; onToast: (msg: string) => void }) {
  const [eventType, setEventType] = useState<string>('M&A — sale of company');
  const [grossInput, setGrossInput] = useState<string>('$45,000,000');
  const [rows, setRows] = useState<WaterfallRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunWaterfall = async () => {
    setError(null);
    const proceeds = parseNumeric(grossInput, 0);
    if (proceeds < 0) {
      setError('Gross proceeds must be >= 0.');
      return;
    }
    setRunning(true);
    const res = await fetchJson<{ data: WaterfallRow[] }>('/api/cap/waterfall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exit_value: proceeds }),
    });
    setRunning(false);
    if (!res.ok) {
      setError(res.error ?? 'Waterfall failed.');
      return;
    }
    setRows(res.data.data);
    onToast('Waterfall recalculated');
  };

  const totalPayout = rows?.reduce((s, r) => s + Number(r.total_payout), 0) ?? 0;

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumbWizard}>
        <span>Cap Table</span>
      </div>
      <h1 className={styles.titleMb1}>Liquidation Waterfall</h1>
      <p className={styles.subtitleMb5}>
        Proceeds allocation follows the preference stack on file — liquidation multiples, participation, and seniority from the share classes. Preferred holders convert to common when it pays more.
      </p>

      <div className={styles.grid3Gap4}>
        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Liquidity event</h2>
          <div className={styles.stack3}>
            <div>
              <label className={styles.fieldLabel}>Event type</label>
              <select className={styles.fieldSelect} value={eventType} onChange={(e) => setEventType(e.target.value)}>
                <option>M&amp;A — sale of company</option>
                <option>IPO</option>
                <option>Secondary tender</option>
                <option>Dissolution</option>
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel}>Gross proceeds</label>
              <input className={styles.fieldInput} value={grossInput} onChange={(e) => setGrossInput(e.target.value)} />
            </div>
            <button type="button" className={styles.btnPrimaryFull} onClick={() => void handleRunWaterfall()} disabled={running}>
              {running ? 'Calculating…' : 'Calculate waterfall'}
            </button>
          </div>
          {error && <div className={styles.drawerError}>{error}</div>}
          <div className={styles.infoCallout}>
            <span className={`material-symbols-outlined ${styles.icon14Inline}`}>info</span>
            Preferred holders choose between preference or converting to common — whichever returns more.
          </div>
        </div>

        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <h2 className={styles.cardTitleMb3}>Proceeds allocation</h2>
          {rows ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Holder</th>
                    <th className={styles.th}>Class</th>
                    <th className={styles.thRight}>Preference</th>
                    <th className={styles.thRight}>Proceeds</th>
                    <th className={styles.thRight}>%</th>
                  </tr>
                </thead>
                <tbody className={styles.tbody}>
                  {rows.map((r) => (
                    <tr key={`${r.holder_name}-${r.share_class}`}>
                      <td className={styles.td}>{r.holder_name}</td>
                      <td className={styles.td}>{r.share_class}</td>
                      <td className={styles.tdRight}>{Number(r.preference) > 0 ? money0(Number(r.preference)) : '—'}</td>
                      <td className={styles.tdRight}>{money0(Number(r.total_payout))}</td>
                      <td className={styles.tdRight}>{totalPayout > 0 ? ((Number(r.total_payout) / totalPayout) * 100).toFixed(2) : '0.00'}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className={styles.tfoot}>
                  <tr>
                    <td className={styles.td} colSpan={3}>Total</td>
                    <td className={styles.tdRight}>{money0(totalPayout)}</td>
                    <td className={styles.tdRight}>100.00%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>No waterfall run yet</div>
              Enter gross proceeds and calculate to see the allocation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapValuationsView({
  state,
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>409A &amp; Valuations</h1>
          <p className={styles.subtitle}>Refresh cadence, provider, price per share, status.</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('409A')}>
          <span className={`material-symbols-outlined ${styles.icon16}`}>gavel</span>
          New valuation
        </button>
      </div>

      {state.activeFmv && (
        <div className={styles.bannerOk}>
          Active FMV: {money(state.activeFmv.fmvPerShare)}/share, effective {state.activeFmv.effectiveDate}, expires {state.activeFmv.expiresOn}
          {state.activeFmv.provider ? ` — ${state.activeFmv.provider}` : ''}.
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Type</th>
                <th className={styles.thRight}>Implied value</th>
                <th className={styles.th}>Provider</th>
                <th className={styles.thRight}>Price/share</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.valuations.map((v) => (
                <tr
                  key={v.id}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow({ date: v.effectiveDate, type: v.type, provider: v.provider ?? '', pricePerShare: v.fmvPerShare, status: v.status }), 'cap')}
                >
                  <td className={styles.td}>{v.effectiveDate}</td>
                  <td className={styles.td}>{v.type}</td>
                  <td className={styles.tdRight}>{money0(v.fmvPerShare * state.company.fullyDiluted)}</td>
                  <td className={styles.td}>{v.provider ?? '—'}</td>
                  <td className={styles.tdRight}>{money(v.fmvPerShare)}</td>
                  <td className={styles.td}>
                    <StatusPill status={v.status} />
                  </td>
                  <td className={styles.tdAction} />
                </tr>
              ))}
              {state.valuations.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={7}>No valuations on file — open a 409A request to start one.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.panelCard} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitleMb3}>Valuation requests</h2>
        {state.valRequests.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No open requests</div>
            New valuation requests appear here with their gate status.
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Valuation date</th>
                  <th className={styles.th}>Method</th>
                  <th className={styles.th}>Purpose</th>
                  <th className={styles.th}>Provider</th>
                  <th className={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {state.valRequests.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.td}>{r.valuationDate}</td>
                    <td className={styles.td}>{r.method}</td>
                    <td className={styles.td}>{r.purpose}</td>
                    <td className={styles.td}>{r.providerName ?? '—'}</td>
                    <td className={styles.td}>
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CapDocumentsView({
  state,
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  state: CapState;
  onCapCreate: (label: string, prefill?: Record<string, string>) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>Charter, financing docs, plan, bylaws — signed originals.</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => onCapCreate('Document')}>
          <span className={`material-symbols-outlined ${styles.icon16}`}>upload</span>
          Upload
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Date</th>
                <th className={styles.thRight}>Size</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.documents.map((d) => (
                <tr
                  key={d.id}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow({ name: d.title, category: d.type, date: d.signedOn ?? d.createdAt, status: d.status }), 'cap')}
                >
                  <td className={styles.tdDocName}>
                    <span className={`material-symbols-outlined ${styles.icon16Muted}`}>description</span>
                    {d.title}
                  </td>
                  <td className={styles.td}>{d.type}</td>
                  <td className={styles.td}>{d.signedOn ?? d.createdAt.slice(0, 10)}</td>
                  <td className={styles.tdRight}>—</td>
                  <td className={styles.td}>
                    <StatusPill status={d.status} />
                  </td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (d.fileUrl) window.open(d.fileUrl, '_blank', 'noopener');
                        else onToast('No file attached to this record');
                      }}
                    >
                      <span className={`material-symbols-outlined ${styles.icon16Muted}`}>download</span>
                    </button>
                  </td>
                </tr>
              ))}
              {state.documents.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={6}>No documents on file.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapEquityEventsView({
  state,
  onToast,
  onOpenPeek,
  onOpenTransaction,
  onRefresh,
}: {
  state: CapState;
  onToast: (msg: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onOpenTransaction: (action: string, prefill?: Record<string, string>) => void;
  onRefresh: () => void;
}) {
  const [snapshotting, setSnapshotting] = useState(false);
  const deltaFor = (e: CapState['events'][number]) => {
    if (e.shares == null) return '—';
    const neg = e.eventType === 'cancellation' || e.eventType === 'repurchase';
    return `${neg ? '−' : '+'}${numFmt(e.shares)}`;
  };
  const noteFor = (e: CapState['events'][number]) => {
    const d = e.details ?? {};
    if (typeof d.price === 'number') return money(d.price);
    if (typeof d.exercise_price === 'number') return money(d.exercise_price);
    if (typeof d.note === 'string') return d.note;
    return '';
  };

  const takeSnapshot = async () => {
    setSnapshotting(true);
    const res = await fetchJson('/api/cap/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual' }),
    });
    setSnapshotting(false);
    if (!res.ok) {
      onToast(res.error ?? 'Snapshot failed.');
      return;
    }
    onToast('Snapshot frozen');
    onRefresh();
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Equity Events</h1>
          <p className={styles.subtitle}>Immutable ledger — grants, exercises, conversions, issuances, cancellations.</p>
        </div>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.btnOutline} onClick={() => void takeSnapshot()} disabled={snapshotting}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>camera_alt</span>
            {snapshotting ? 'Freezing…' : 'Freeze snapshot'}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => onOpenTransaction('exercise')}>
            <span className={`material-symbols-outlined ${styles.icon16}`}>post_add</span>
            Record event
          </button>
        </div>
      </div>

      <div className={state.ledger.valid ? styles.bannerOk : styles.bannerWarn}>
        {state.ledger.valid
          ? `Ledger verified — ${state.ledger.eventsChecked} events, hash chain intact${state.ledger.headHash ? ` (head ${state.ledger.headHash.slice(0, 12)}…)` : ''}.`
          : `Ledger BROKEN at seq ${state.ledger.firstBrokenSeq} — do not rely on this history.`}
        {state.snapshots.length > 0 && ` Latest snapshot: ${state.snapshots[0].asOf} (${state.snapshots[0].reason}).`}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Event</th>
                <th className={styles.th}>Holder</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Price</th>
                <th className={styles.th}>Delta</th>
                <th className={styles.th}>Note</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {state.events.map((e) => (
                <tr
                  key={e.id}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow({ date: e.date, event: e.eventType, holder: e.holder ?? '', shares: e.shares ?? 0 }), 'cap')}
                >
                  <td className={styles.td}>{e.date}</td>
                  <td className={styles.tdMedium}>{e.eventType}</td>
                  <td className={styles.td}>{e.holder ?? '—'}</td>
                  <td className={styles.tdRight}>{e.shares != null ? numFmt(e.shares) : '—'}</td>
                  <td className={styles.tdRight}>{e.amount != null ? money0(e.amount) : '—'}</td>
                  <td className={deltaFor(e).startsWith('+') ? styles.tdDeltaPos : styles.tdDeltaNeutral}>{deltaFor(e)}</td>
                  <td className={styles.tdSmallMuted}>{noteFor(e)}</td>
                  <td className={styles.tdAction} />
                </tr>
              ))}
              {state.events.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={8}>No events yet — issuances, grants, and exercises are recorded here automatically.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapControlsView({
  state,
  onToast,
}: {
  state: CapState;
  onToast: (msg: string) => void;
}) {
  const [secondAdmin, setSecondAdmin] = useState<boolean>(true);

  const PERMS: { role: string; view: string; holders: string; edit: string; approve: string }[] = [
    { role: 'Admin', view: 'Full table', holders: 'Full details', edit: 'Yes', approve: 'Yes' },
    { role: 'Board Member', view: 'Read-only summary', holders: '—', edit: '—', approve: '—' },
    { role: 'Accountant', view: 'Totals only', holders: '—', edit: '—', approve: '—' },
    { role: 'Employee (holder)', view: 'Own grants', holders: 'Own record', edit: '—', approve: '—' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Controls</h1>
          <p className={styles.subtitle}>
            Who can view or edit — grants, exercises, transfers, and repurchases all post through the equity event ledger.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnOutline}
          onClick={() => onToast('Permissions are managed in Settings → Roles and permissions')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>shield_person</span>
          Open roles
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>View cap table</th>
                <th className={styles.th}>Holder details</th>
                <th className={styles.th}>Edit records</th>
                <th className={styles.th}>Approve changes</th>
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {PERMS.map((p) => (
                <tr key={p.role}>
                  <td className={styles.tdMedium}>{p.role}</td>
                  <td className={styles.td}>{p.view}</td>
                  <td className={styles.td}>{p.holders}</td>
                  <td className={styles.td}>{p.edit}</td>
                  <td className={styles.td}>{p.approve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.panelCard} style={{ marginTop: 16 }}>
        <h2 className={styles.cardTitleMb3}>Live checks</h2>
        {state.controls.length === 0 && state.compliance.length === 0 ? (
          <p className={styles.cardMeta11}>No control or compliance findings — the cap table passes every check.</p>
        ) : (
          <div className={styles.divideList}>
            {[...state.controls, ...state.compliance].map((c, i) => (
              <div key={`${c.checkCode}-${i}`} className={styles.recentEventRow}>
                <div className={styles.recentEventLeft}>
                  <div className={styles.recentEventTitle}>{c.checkCode}</div>
                  <div className={styles.recentEventSub}>{c.message}</div>
                </div>
                <StatusPill status={c.severity} />
              </div>
            ))}
          </div>
        )}
        <p className={styles.cardMeta11} style={{ marginTop: 8 }}>
          Ledger: {state.ledger.valid ? `verified (${state.ledger.eventsChecked} events)` : `BROKEN at seq ${state.ledger.firstBrokenSeq}`}.
        </p>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panelCard}>
          <div className={styles.cardTitleMb2}>Changes need a second admin</div>
          <p className={styles.cardMeta11}>
            When enforced, every change to the table — grants, exercises, transfers, repurchases — needs approval from a second admin before it posts.
          </p>
          <button
            type="button"
            className={`${styles.createActionChip} ${secondAdmin ? '' : styles.createActionChipOff}`}
            data-second-admin={secondAdmin ? 'on' : 'off'}
            aria-pressed={secondAdmin}
            onClick={() => {
              const next = !secondAdmin;
              setSecondAdmin(next);
              onToast(next ? 'Second-admin approval enforced for all cap table changes' : 'Warning: cap table changes now post without a second admin');
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {secondAdmin ? 'toggle_on' : 'toggle_off'}
            </span>
            {secondAdmin ? 'Enforced' : 'Off'}
          </button>
        </div>
        <div className={styles.panelCard}>
          <div className={styles.cardTitleMb2}>Audit</div>
          <p className={styles.cardMeta11}>
            Every view of sensitive holder fields and every create, edit, void, approve, and export is logged with actor, time, and before/after values.
          </p>
          <button type="button" className={styles.createActionChip} onClick={() => onToast('Opening audit log — cap table scope')}>
            <span className={`material-symbols-outlined ${styles.icon16}`} style={{ fontSize: 16 }}>history</span>
            View audit log
          </button>
        </div>
      </div>
    </div>
  );
}

export const CAP_TABLE_SCREEN_IDS = new Set([
  'cap-overview',
  'cap-table',
  'cap-holders',
  'cap-rounds',
  'cap-options',
  'cap-safes',
  'cap-dilution',
  'cap-waterfall',
  'cap-409a',
  'cap-controls',
  'cap-documents',
  'cap-equity-events',
]);

export default function CapTableScreenRenderer({
  screenId,
  onGotoScreen,
  onCapCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: CapTableScreenRendererProps) {
  const cap = useCapState();
  const [createKind, setCreateKind] = useState<string | null>(null);
  const [createPrefill, setCreatePrefill] = useState<Record<string, string> | undefined>(undefined);
  const [txn, setTxn] = useState<{ action: TxnAction; prefill?: Record<string, string> } | null>(null);

  const openCreate = useCallback(
    (label: string, prefill?: Record<string, string>) => {
      if (CREATE_DEFS[label]) {
        setCreatePrefill(prefill);
        setCreateKind(label);
      } else {
        onCapCreate(label);
      }
    },
    [onCapCreate],
  );

  const openTransaction = useCallback((action: string, prefill?: Record<string, string>) => {
    const valid: TxnAction[] = ['exercise', 'cancel', 'convert', 'transfer', 'repurchase', 'split', 'file83b'];
    setTxn({ action: valid.includes(action as TxnAction) ? (action as TxnAction) : 'exercise', prefill });
  }, []);

  if (cap.loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>Loading cap table…</div>
      </div>
    );
  }
  if (cap.error || !cap.state) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Couldn’t load the cap table</div>
          {cap.error ?? 'Unknown error.'}
          <div style={{ marginTop: 12 }}>
            <button type="button" className={styles.btnPrimary} onClick={() => void cap.refresh()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const state = cap.state;
  const refresh = () => void cap.refresh(cap.asOf || undefined);

  return (
    <>
      {screenId === 'cap-overview' && (
        <CapOverviewView state={state} onGotoScreen={onGotoScreen} onCapCreate={openCreate} onOpenCreateFlyout={onOpenCreateFlyout} onToast={onToast} onRefresh={refresh} />
      )}
      {screenId === 'cap-table' && (
        <CapTableMainView state={state} asOf={cap.asOf} onAsOfChange={cap.applyAsOf} onOpenPeek={onOpenPeek} onCapCreate={openCreate} onToast={onToast} />
      )}
      {screenId === 'cap-holders' && (
        <CapHoldersView state={state} onCapCreate={openCreate} onOpenPeek={onOpenPeek} onToast={onToast} />
      )}
      {screenId === 'cap-rounds' && (
        <CapRoundsView state={state} onCapCreate={openCreate} onRefresh={refresh} onToast={onToast} />
      )}
      {screenId === 'cap-options' && (
        <CapOptionsView state={state} onCapCreate={openCreate} onOpenPeek={onOpenPeek} onToast={onToast} onOpenTransaction={openTransaction} />
      )}
      {screenId === 'cap-safes' && (
        <CapSafesView state={state} onCapCreate={openCreate} onOpenPeek={onOpenPeek} onToast={onToast} onOpenTransaction={openTransaction} />
      )}
      {screenId === 'cap-dilution' && <CapDilutionView state={state} onToast={onToast} />}
      {screenId === 'cap-waterfall' && <CapWaterfallView state={state} onToast={onToast} />}
      {screenId === 'cap-409a' && (
        <CapValuationsView state={state} onCapCreate={openCreate} onOpenPeek={onOpenPeek} onToast={onToast} />
      )}
      {screenId === 'cap-controls' && <CapControlsView state={state} onToast={onToast} />}
      {screenId === 'cap-documents' && (
        <CapDocumentsView state={state} onCapCreate={openCreate} onOpenPeek={onOpenPeek} onToast={onToast} />
      )}
      {screenId === 'cap-equity-events' && (
        <CapEquityEventsView state={state} onToast={onToast} onOpenPeek={onOpenPeek} onOpenTransaction={openTransaction} onRefresh={refresh} />
      )}
      {createKind && (
        <CapCreateDrawer kind={createKind} prefill={createPrefill} state={state} onClose={() => setCreateKind(null)} onDone={refresh} onToast={onToast} />
      )}
      {txn && (
        <TransactionDrawer action={txn.action} prefill={txn.prefill} state={state} onClose={() => setTxn(null)} onDone={refresh} onToast={onToast} />
      )}
    </>
  );
}
