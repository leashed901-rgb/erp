'use client';
/* useAccountingApi — client data layer for the Accounting screens
   over /api/accounting/*. Balances and registers are computed by the
   API from acct_journal_*; mutations write acct_* tables directly. */
import { useCallback, useEffect, useState } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';
import type { CoaAccount, RegisterLine, BankAccountDto, BankTxnDto, BankRuleDto, MatchCandidate, ReceiptDto, ReceiptMatchCandidate, OverviewDto, ReportDto, SavedViewDto } from '@/lib/acctTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

export function useChartOfAccounts() {
  const { data, loaded, error, refresh, setData } = useList<CoaAccount>(
    'acctChartOfAccounts',
    '/api/accounting/chart-of-accounts',
    (raw) => ((raw as { data?: CoaAccount[] })?.data ?? []) as CoaAccount[],
  );
  return { accounts: data, loading: !loaded, error, refresh, setAccounts: setData };
}

export interface CoaInput {
  name: string;
  code: string;
  type: string;
  detail?: string;
  description?: string;
  parentAccountId?: string | null;
  taxLine?: string;
  openingBalance?: number;
  openingDate?: string;
  isActive?: boolean;
}

export const coaMutations = {
  create: (input: CoaInput) =>
    call<CoaAccount>('/api/accounting/chart-of-accounts', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<CoaInput> & { isActive?: boolean }) =>
    call<CoaAccount>('/api/accounting/chart-of-accounts', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }),
  remove: (id: string) =>
    call<{ id: string; deleted: boolean }>(`/api/accounting/chart-of-accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export interface AccountRegister {
  openingBalance: number;
  activity: number;
  closingBalance: number;
  lines: RegisterLine[];
}

export async function fetchAccountRegister(id: string): Promise<MutationResult<AccountRegister>> {
  return call<AccountRegister>(`/api/accounting/chart-of-accounts/${encodeURIComponent(id)}/register`);
}

/* ── Bank feed ─────────────────────────────────────────────────── */

export function useBankAccounts() {
  const { data, loaded, error, refresh } = useList<BankAccountDto>(
    'acctBankAccounts',
    '/api/accounting/bank-accounts',
    (raw) => ((raw as { data?: BankAccountDto[] })?.data ?? []) as BankAccountDto[],
  );
  return { bankAccounts: data, loading: !loaded, error, refresh };
}

export function useBankTransactions(accountId: string | null) {
  const { data, loaded, error, refresh, setData } = useList<BankTxnDto>(
    `acctBankTxns-${accountId || 'all'}`,
    accountId ? `/api/accounting/bank-transactions?accountId=${encodeURIComponent(accountId)}` : '/api/accounting/bank-transactions',
    (raw) => ((raw as { data?: BankTxnDto[] })?.data ?? []) as BankTxnDto[],
  );
  return { transactions: data, loading: !loaded, error, refresh, setTransactions: setData };
}

export const bankTxnMutations = {
  categorize: (id: string, categoryAccountId: string) =>
    call(`/api/accounting/bank-transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ categoryAccountId }) }),
  exclude: (id: string, reason?: string) =>
    call(`/api/accounting/bank-transactions/${encodeURIComponent(id)}/exclude`, { method: 'POST', body: JSON.stringify({ reason: reason || 'Excluded by user' }) }),
  restore: (id: string) =>
    call(`/api/accounting/bank-transactions/${encodeURIComponent(id)}/exclude`, { method: 'POST', body: JSON.stringify({ undo: true }) }),
  match: (id: string, journalLineId: string) =>
    call(`/api/accounting/bank-transactions/${encodeURIComponent(id)}/match`, { method: 'POST', body: JSON.stringify({ journalLineId }) }),
  remove: (id: string) =>
    call(`/api/accounting/bank-transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export async function fetchMatchCandidates(id: string): Promise<MutationResult<MatchCandidate[]>> {
  return call<MatchCandidate[]>(`/api/accounting/bank-transactions/${encodeURIComponent(id)}/match-candidates`);
}

/* ── Bank rules ────────────────────────────────────────────────── */

export function useBankRules() {
  const { data, loaded, error, refresh, setData } = useList<BankRuleDto>(
    'acctBankRules',
    '/api/accounting/bank-rules',
    (raw) => ((raw as { data?: BankRuleDto[] })?.data ?? []) as BankRuleDto[],
  );
  return { rules: data, loading: !loaded, error, refresh, setRules: setData };
}

export interface BankRuleInput {
  name: string;
  priority?: number;
  appliesTo?: string;
  matchMode?: string;
  txnType?: string;
  bankAccountIds?: string[];
  autoConfirm?: boolean;
  isActive?: boolean;
  conditions: { field: string; operator: string; value: string; value2?: string | null; caseSensitive?: boolean }[];
  categoryAccountId?: string;
  splits?: { accountId: string; percent?: number | null }[];
}

export const bankRuleMutations = {
  create: (input: BankRuleInput) =>
    call<BankRuleDto>('/api/accounting/bank-rules', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<BankRuleInput>) =>
    call<BankRuleDto>('/api/accounting/bank-rules', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }),
  remove: (id: string) =>
    call<{ id: string; deleted: boolean }>(`/api/accounting/bank-rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  apply: (id: string) =>
    call<{ id: string; appliedNow: number; timesApplied: number }>(`/api/accounting/bank-rules/${encodeURIComponent(id)}/apply`, { method: 'POST' }),
};

export interface BankRuleStats {
  autoCategorized30d: number;
  matchRate: number;
  totalTransactions: number;
}

export async function fetchBankRuleStats(): Promise<MutationResult<BankRuleStats>> {
  return call<BankRuleStats>('/api/accounting/bank-rules/stats');
}

/* ── Receipts ──────────────────────────────────────────────────── */

export function useReceipts() {
  const { data, loaded, error, refresh, setData } = useList<ReceiptDto>(
    'acctReceipts',
    '/api/accounting/receipts',
    (raw) => ((raw as { data?: ReceiptDto[] })?.data ?? []) as ReceiptDto[],
  );
  return { receipts: data, loading: !loaded, error, refresh, setReceipts: setData };
}

export const receiptMutations = {
  intake: (input: { fileName: string; sha256: string; source?: 'upload' | 'photo'; sizeBytes?: number; mimeType?: string }) =>
    call<{ id: string }>('/api/accounting/receipts', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: { vendorName?: string; receiptDate?: string; total?: number; taxAmount?: number; categoryAccountId?: string | null; notes?: string | null; status?: 'review' | 'reviewed' }) =>
    call(`/api/accounting/receipts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) =>
    call(`/api/accounting/receipts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createExpense: (id: string, input: { categoryAccountId: string; bankAccountId: string; vendorName?: string; date?: string; total: number; taxAmount?: number }) =>
    call<{ id: string; spendId: string }>(`/api/accounting/receipts/${encodeURIComponent(id)}/create-expense`, { method: 'POST', body: JSON.stringify(input) }),
  createBill: (id: string, input: { vendorName: string; date?: string; total: number; taxAmount?: number }) =>
    call<{ id: string; billId: string; billNumber: string }>(`/api/accounting/receipts/${encodeURIComponent(id)}/create-bill`, { method: 'POST', body: JSON.stringify(input) }),
  match: (id: string, bankTransactionId: string) =>
    call(`/api/accounting/receipts/${encodeURIComponent(id)}/match`, { method: 'POST', body: JSON.stringify({ bankTransactionId }) }),
  attachBill: (id: string, billId: string) =>
    call(`/api/accounting/receipts/${encodeURIComponent(id)}/attach-bill`, { method: 'POST', body: JSON.stringify({ billId }) }),
};

/* ── Reconciliations ─────────────────────────────────────────────── */

export interface ReconcileLineDto {
  id: string;
  date: string;
  entryNo: number | null;
  description: string;
  amount: number;
  cleared: boolean;
}

export interface ReconcileWorkspaceDto {
  bankAccountId: string;
  glAccountId: string;
  beginningBalance: number;
  active: {
    id: string;
    status: string;
    statementEndDate: string | null;
    statementEndingBalance: number | null;
    beginningBalance: number;
  } | null;
  lines: ReconcileLineDto[];
  pastCount: number;
}

export interface ReconcileSummaryDto {
  beginningBalance: number;
  clearedDeposits: number;
  clearedPayments: number;
  clearedBalance: number;
  statementEndingBalance: number;
  difference: number;
  unclearedCount: number;
}

export function useReconcileWorkspace(bankAccountId: string | null) {
  const [data, setData] = useState<ReconcileWorkspaceDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!bankAccountId) {
      setData(null);
      setLoaded(true);
      return;
    }
    const res = await call<ReconcileWorkspaceDto>(`/api/accounting/reconciliations?bankAccountId=${encodeURIComponent(bankAccountId)}`);
    if (res.ok && res.data) setData(res.data);
    setLoaded(true);
  }, [bankAccountId]);
  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);
  return { workspace: data, loaded, refresh };
}

export const reconcileMutations = {
  start: (input: { bankAccountId: string; statementEndDate: string; statementEndingBalance: number }) =>
    call<{ id: string }>('/api/accounting/reconciliations', { method: 'POST', body: JSON.stringify(input) }),
  mark: (id: string, journalLineIds: string[], cleared: boolean) =>
    call(`/api/accounting/reconciliations/${encodeURIComponent(id)}/mark`, { method: 'POST', body: JSON.stringify({ journalLineIds, cleared }) }),
  summary: (id: string) => call<ReconcileSummaryDto>(`/api/accounting/reconciliations/${encodeURIComponent(id)}/summary`),
  finish: (id: string, postAdjustment = false) =>
    call(`/api/accounting/reconciliations/${encodeURIComponent(id)}/finish`, { method: 'POST', body: JSON.stringify({ postAdjustment }) }),
};

export interface OpenBillDto {
  id: string;
  billNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  billDate: string | null;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  status: string;
  approvalStatus: string | null;
  memo: string;
  category: string | null;
  source: string | null;
  attachmentsCount: number;
  inboxId: string | null;
}

export async function fetchOpenBills(): Promise<MutationResult<OpenBillDto[]>> {
  return call<OpenBillDto[]>('/api/accounting/bills');
}

export function useBillsList() {
  const { data, loaded, error, refresh, setData } = useList<OpenBillDto>(
    'accounting-bills',
    '/api/accounting/bills',
    (raw) => ((raw as { data?: OpenBillDto[] })?.data ?? []) as OpenBillDto[],
  );
  return { bills: data, loading: !loaded, error, refresh, setBills: setData };
}

/* Bill actions ride the Document Engine API (the platform's own
   document family over acct_ap_bills). */
export const billActions = {
  approve: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Bill`, {
      method: 'PATCH',
      body: JSON.stringify({ approval_status: 'approved', status: 'open' }),
    }),
  pay: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}/pay?type=Bill`, { method: 'POST', body: '{}' }),
  remove: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Bill`, { method: 'DELETE' }),
  create: (input: {
    partyId: string;
    number: string;
    date: string;
    dueDate: string;
    memo?: string;
    total: number;
    categoryAccountId?: string;
    categoryLabel?: string;
  }) =>
    call('/api/v1/documents', {
      method: 'POST',
      body: JSON.stringify({
        type: 'Bill',
        partyId: input.partyId,
        number: input.number,
        date: input.date,
        dueDate: input.dueDate,
        memo: input.memo || '',
        subtotal: input.total,
        total: input.total,
        lines: [
          {
            description: input.categoryLabel || 'Bill',
            quantity: 1,
            unitPrice: input.total,
            accountId: input.categoryAccountId,
          },
        ],
      }),
    }),
};

/* ── Vendors (acct_vendors) ── */
export interface VendorDto {
  id: string;
  legalName: string;
  vendorNumber: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
}
export function useVendors() {
  const { data, loaded, error, refresh } = useList<VendorDto>(
    'accounting-vendors',
    '/api/accounting/vendors',
    (raw) => ((raw as { data?: VendorDto[] })?.data ?? []) as VendorDto[],
  );
  return { vendors: data, loading: !loaded, error, refresh };
}
export async function findOrCreateVendor(name: string): Promise<MutationResult<VendorDto & { created: boolean }>> {
  return call<VendorDto & { created: boolean }>('/api/accounting/vendors', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchReceiptMatchCandidates(id: string): Promise<MutationResult<ReceiptMatchCandidate[]>> {
  return call<ReceiptMatchCandidate[]>(`/api/accounting/receipts/${encodeURIComponent(id)}/match-candidates`);
}

/* ── Reports ───────────────────────────────────────────────────── */

export async function fetchReport(
  id: string,
  opts: { from: string; to: string; compare?: boolean; pct?: boolean },
): Promise<MutationResult<ReportDto>> {
  const qs = new URLSearchParams({ from: opts.from, to: opts.to });
  if (opts.compare) qs.set('compare', '1');
  if (opts.pct) qs.set('pct', '1');
  return call<ReportDto>(`/api/accounting/reports/${encodeURIComponent(id)}?${qs.toString()}`);
}

export function useSavedReportViews() {
  const { data, loaded, error, refresh } = useList<SavedViewDto>(
    'acctReportViews',
    '/api/accounting/reports/views',
    (raw) => ((raw as { data?: SavedViewDto[] })?.data ?? []) as SavedViewDto[],
  );
  return { views: data, loading: !loaded, error, refresh };
}

export const reportViewMutations = {
  save: (input: { name: string; from: string; to: string; config: Record<string, unknown> }) =>
    call<{ id: string; name: string }>('/api/accounting/reports/views', { method: 'POST', body: JSON.stringify(input) }),
  /* no remove: published snapshots are immutable by platform trigger */
};

/* ── Overview ──────────────────────────────────────────────────── */

export function useAccountingOverview() {
  const [overview, setOverview] = useState<OverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await call<OverviewDto>('/api/accounting/overview');
      if (!alive) return;
      if (res.ok && res.data) {
        setOverview(res.data);
        setError(null);
      } else {
        setError(res.error || 'Overview failed to load');
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tick]);
  return { overview, loading, error, refresh };
}

/* ── Cash flow forecast (real balances + open documents) ── */
export interface CashflowForecastDto {
  asOf: string;
  cashOnHand: number;
  accounts: { id: string; name: string; mask: string | null; balance: number }[];
  invoices: { id: string; no: string; amount: number; dueDate: string | null }[];
  bills: { id: string; no: string; vendor: string; amount: number; dueDate: string | null }[];
}
export function useCashflowForecast() {
  const [data, setData] = useState<CashflowForecastDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetchJson<CashflowForecastDto>('/api/accounting/cashflow-forecast');
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, error, refresh };
}

/* ── Estimates (acct_estimates via /api/accounting/estimates +
      Document Engine writes) ── */
export interface EstimateLineDto {
  id: string;
  desc: string;
  qty: number;
  rate: number;
}
export interface EstimateDto {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  estimateDate: string | null;
  expiryDate: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  status: string;
  notes: string;
  lines: EstimateLineDto[];
  convertedInvoiceId: string | null;
  convertedInvoiceNo: string | null;
  createdAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
}
export function useEstimates() {
  const { data, loaded, error, refresh, setData } = useList<EstimateDto>(
    'accounting-estimates',
    '/api/accounting/estimates',
    (raw) => ((raw as { data?: EstimateDto[] })?.data ?? []) as EstimateDto[],
  );
  return { estimates: data, loading: !loaded, error, refresh, setEstimates: setData };
}

export interface EstimateInput {
  number: string;
  partyId: string;
  date: string;
  expiryDate: string;
  status: string;
  notes?: string;
  lines: { desc: string; qty: number; rate: number }[];
}
const estimateBody = (input: EstimateInput) => {
  const subtotal = input.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  return {
    subtotal,
    total: subtotal,
    lines: input.lines.map((l) => ({ description: l.desc, quantity: l.qty, unit_price: l.rate })),
  };
};
export const estimateActions = {
  create: (input: EstimateInput) =>
    call('/api/v1/documents', {
      method: 'POST',
      body: JSON.stringify({
        type: 'Estimate',
        partyId: input.partyId,
        number: input.number,
        date: input.date,
        expiryDate: input.expiryDate,
        status: input.status,
        notes: input.notes || '',
        ...estimateBody(input),
      }),
    }),
  update: (id: string, input: EstimateInput) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Estimate`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: input.status,
        estimate_date: input.date,
        expiry_date: input.expiryDate,
        notes: input.notes || '',
        ...estimateBody(input),
      }),
    }),
  send: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}/send?type=Estimate`, { method: 'POST', body: '{}' }),
  markAccepted: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Estimate`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString() }),
    }),
  markDeclined: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Estimate`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'declined', declined_at: new Date().toISOString() }),
    }),
  convert: (id: string) =>
    call<{ id: string; invoice_number?: string }>(
      `/api/v1/documents/${encodeURIComponent(id)}/convert?type=Estimate&to=invoice`,
      { method: 'POST', body: '{}' }
    ),
  remove: (id: string) =>
    call(`/api/v1/documents/${encodeURIComponent(id)}?type=Estimate`, { method: 'DELETE' }),
};

/* ── Customers (crm_customers via /api/accounting/customers) ── */
export interface CustomerDto {
  id: string;
  displayName: string;
  email: string | null;
}
export function useCustomers() {
  const { data, loaded, error, refresh } = useList<CustomerDto>(
    'accounting-customers',
    '/api/accounting/customers',
    (raw) => ((raw as { data?: CustomerDto[] })?.data ?? []) as CustomerDto[],
  );
  return { customers: data, loading: !loaded, error, refresh };
}
