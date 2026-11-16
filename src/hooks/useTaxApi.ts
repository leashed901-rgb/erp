'use client';
/**
 * Tax hooks (docs 10 + 11) — screens consume these; every hook reads the
 * real /api/tax/* routes via the shared resilient fetch layer.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchJson, useList } from './useCrmApi';
import type {
  TaxSummary, TaxLineOption, Summary1099, EfileFiling,
  TaxJurisdiction, TaxCode, TaxNexus, NexusAlert, TaxExemption,
  TaxTransaction, TaxFiling, MarketplaceRemittance,
  TaxRule, TaxabilityRule,
} from '@/lib/taxTypes';

export type {
  TaxSummary, TaxLineOption, Summary1099, EfileFiling,
  TaxJurisdiction, TaxCode, TaxNexus, NexusAlert, TaxExemption,
  TaxTransaction, TaxFiling, MarketplaceRemittance,
  TaxRule, TaxabilityRule,
} from '@/lib/taxTypes';

const unwrap = <T,>(raw: unknown): T[] => ((raw as { data: T[] })?.data || []) as T[];

/* ── Single-object fetch hook ─────────────────────────────── */
export function useOne<T>(key: string, url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetchJson<{ data: T }>(url).then((r) => {
      if (!live) return;
      if (r.ok) { setData(r.data.data); setError(null); }
      else setError(r.error);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [url, tick, key]);
  return { data, loaded, error, refresh };
}

/* ── Doc 10: business tax ─────────────────────────────────── */

export function useTaxSummary(year: number) {
  return useOne<TaxSummary>(`taxSummary:${year}`, `/api/tax/summary?year=${year}`);
}

export function useTaxLines() {
  return useList<TaxLineOption & { id: string }>('taxLines', '/api/tax/tax-lines', (raw) =>
    unwrap<TaxLineOption>(raw).map((l, i) => ({ ...l, id: l.id || `label:${l.label}:${i}` })));
}

export function useEfileFilings(year: number) {
  return useList<EfileFiling>(`efileFilings:${year}`, `/api/tax/efile-filings?year=${year}`, unwrap<EfileFiling>);
}

export function use1099Summary(year: number) {
  return useOne<Summary1099>(`summary1099:${year}`, `/api/tax/1099/summary?year=${year}`);
}

export interface JournalLineDto {
  id: string; entryNo: number | null; date: string | null; memo: string; debit: number; credit: number;
}

export function useAccountTransactions(accountId: string | null, year: number) {
  return useOne<JournalLineDto[]>(
    `taxTxns:${accountId}:${year}`,
    accountId ? `/api/tax/transactions?accountId=${accountId}&year=${year}` : null,
  );
}

/* ── Doc 11: sales tax ────────────────────────────────────── */

export function useTaxJurisdictions() {
  return useList<TaxJurisdiction>('taxJurisdictions', '/api/tax/jurisdictions', unwrap<TaxJurisdiction>);
}

export function useTaxCodes() {
  return useList<TaxCode>('taxCodes', '/api/v1/tax/rates', (raw) =>
    unwrap<Record<string, unknown>>(raw).map((c) => ({
      id: String(c.id),
      jurisdictionId: (c.jurisdiction_id as string) || null,
      jurisdictionName: ((c.jurisdiction as { name?: string } | null)?.name) || null,
      code: String(c.code),
      name: String(c.name),
      taxType: String(c.tax_type || 'sales'),
      rate: (Number(c.rate) || 0) * 100, // DB stores a fraction; UI works in %
      recoverablePercent: Number(c.recoverable_percent) || 0,
      effectiveFrom: (c.effective_from as string) || null,
      effectiveTo: (c.effective_to as string) || null,
      isCompound: Boolean(c.is_compound),
      isActive: Boolean(c.is_active),
    })));
}

export interface NexusBundle { nexus: TaxNexus[]; alerts: NexusAlert[] }

export function useNexus() {
  return useOne<NexusBundle>('nexus', '/api/tax/nexus');
}

export function useTaxExemptions() {
  return useList<TaxExemption>('taxExemptions', '/api/tax/exemptions', unwrap<TaxExemption>);
}

export function useTaxTransactions(params?: { direction?: string; jurisdictionId?: string }) {
  const qs = new URLSearchParams();
  if (params?.direction) qs.set('direction', params.direction);
  if (params?.jurisdictionId) qs.set('jurisdictionId', params.jurisdictionId);
  const url = `/api/tax/tax-transactions${qs.toString() ? `?${qs}` : ''}`;
  return useList<TaxTransaction>(`taxTransactions:${qs}`, url, unwrap<TaxTransaction>);
}

export function useSalesFilings() {
  return useList<TaxFiling>('salesFilings', '/api/tax/sales-filings', unwrap<TaxFiling>);
}

export function useRemittance() {
  return useList<MarketplaceRemittance>('remittance', '/api/tax/remittance', unwrap<MarketplaceRemittance>);
}

export function useTaxRules() {
  return useList<TaxRule>('taxRules', '/api/tax/rules', unwrap<TaxRule>);
}

export function useTaxabilityRules() {
  return useList<TaxabilityRule>('taxabilityRules', '/api/tax/taxability-rules', unwrap<TaxabilityRule>);
}

/** Legacy acct_tax_rates rows (superseded by acct_tax_codes for the
 *  engine; the route predates the codes model and stays readable). */
export interface LegacyTaxRate {
  id: string;
  name: string;
  jurisdiction: string | null;
  rate_percent: number;
  gl_account_id: string | null;
  is_active: boolean;
}

export function useLegacyTaxRates() {
  return useList<LegacyTaxRate>('legacyTaxRates', '/api/tax/rates', unwrap<LegacyTaxRate>);
}

export interface BankAccountOption { id: string; name: string; institutionName: string | null; maskedAccountNumber: string | null }

export function useBankAccounts() {
  return useList<BankAccountOption & { id: string }>('bankAccounts', '/api/finance/bank-accounts', unwrap<BankAccountOption>);
}

/* ── Mutations ────────────────────────────────────────────── */

export const taxMutations = {
  saveMapping: (accountId: string, taxLineLabel: string | null) =>
    fetchJson('/api/tax/account-mapping', { method: 'PATCH', body: JSON.stringify({ accountId, taxLineLabel }) }),
  setAccountFlag: (accountId: string, flags: { flagged?: boolean; excluded?: boolean }) =>
    fetchJson('/api/tax/account-mapping', { method: 'PATCH', body: JSON.stringify({ accountId, ...flags }) }),
  createFiling: (body: Record<string, unknown>) =>
    fetchJson<{ data: EfileFiling }>('/api/tax/efile-filings', { method: 'POST', body: JSON.stringify(body) }),
  queueFiling: (id: string) =>
    fetchJson(`/api/tax/efile-filings/${id}/queue`, { method: 'POST', body: JSON.stringify({}) }),
  discardFiling: (id: string) =>
    fetchJson(`/api/tax/efile-filings/${id}/queue`, { method: 'DELETE' }),
  generate1099s: (taxYear: number) =>
    fetchJson('/api/tax/1099/generate', { method: 'POST', body: JSON.stringify({ taxYear }) }),
  createJurisdiction: (body: Record<string, unknown>) =>
    fetchJson<{ data: TaxJurisdiction }>('/api/tax/jurisdictions', { method: 'POST', body: JSON.stringify(body) }),
  createTaxCode: (body: Record<string, unknown>) =>
    // UI sends rate as a percent; acct_tax_codes.rate is a fraction (CHECK rate < 1).
    fetchJson('/api/v1/tax/rates', {
      method: 'POST',
      body: JSON.stringify({ ...body, rate: (Number(body.rate) || 0) / 100 }),
    }),
  createNexus: (body: Record<string, unknown>) =>
    fetchJson('/api/tax/nexus', { method: 'POST', body: JSON.stringify(body) }),
  refreshNexus: () => fetchJson('/api/tax/nexus/refresh', { method: 'POST', body: JSON.stringify({}) }),
  createExemption: (body: Record<string, unknown>) =>
    fetchJson('/api/tax/exemptions', { method: 'POST', body: JSON.stringify(body) }),
  prepareSalesFiling: (body: Record<string, unknown>) =>
    fetchJson('/api/tax/sales-filings/prepare', { method: 'POST', body: JSON.stringify(body) }),
  paySalesFiling: (id: string, body: Record<string, unknown>) =>
    fetchJson(`/api/tax/sales-filings/${id}/pay`, { method: 'POST', body: JSON.stringify(body) }),
  createBankAccount: (body: Record<string, unknown>) =>
    fetchJson('/api/finance/bank-accounts', { method: 'POST', body: JSON.stringify(body) }),
  createRemittance: (body: Record<string, unknown>) =>
    fetchJson('/api/tax/remittance', { method: 'POST', body: JSON.stringify(body) }),
  calculateTax: (body: Record<string, unknown>) =>
    // POST /api/v1/tax/calculate — registry action tax.calculate,
    // runs the acct_calculate_tax engine. Body: { lines: [{ amount,
    // tax_category?, tax_code_id? }], jurisdiction_id? | ship_to_state?,
    // customer_id?, tax_date? }.
    fetchJson('/api/v1/tax/calculate', { method: 'POST', body: JSON.stringify(body) }),
};
