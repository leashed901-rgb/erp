/**
 * DTOs for Doc 28 Batch H — fixed assets / depreciation, leases, debt,
 * revenue contracts + recognition schedules. All rows come from the
 * acct_* tables; nothing here is invented — the shapes mirror the live
 * schema (verified 2026-11-15).
 */

export interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  description: string | null;
  status: string;
  acquired: string | null;
  inService: string | null;
  cost: number;
  residual: number;
  accumulated: number;
  netBookValue: number;
  lifeMonths: number | null;
  classId: string | null;
  className: string | null;
  location: string | null;
  serial: string | null;
  disposalDate: string | null;
  disposalProceeds: number | null;
  disposalGainLoss: number | null;
}

export interface AssetBook {
  id: string;
  assetId: string;
  bookId: string;
  method: string;
  convention: string;
  lifeMonths: number;
  inServiceCost: number;
  accumulated: number;
  netBookValue: number;
  startDate: string | null;
  lastDepreciationDate: string | null;
}

export interface AssetClass {
  id: string;
  code: string;
  name: string;
  assetAccountId: string | null;
  accumAccountId: string | null;
  expenseAccountId: string | null;
  lifeMonths: number | null;
  method: string | null;
  residualPercent: number | null;
}

export interface DepreciationRun {
  id: string;
  periodId: string | null;
  runDate: string;
  status: string;
  journalId: string | null;
  postedAt: string | null;
  total: number;
  lines: DepreciationLine[];
}

export interface DepreciationLine {
  id: string;
  assetBookId: string;
  assetName: string;
  assetNumber: string;
  amount: number;
  accumulatedAfter: number;
  nbvAfter: number;
}

export interface DebtInstrument {
  id: string;
  kind: string;
  name: string;
  lenderVendorId: string | null;
  lenderName: string | null;
  bankAccountId: string;
  bankAccountName: string | null;
  apr: number;
  termMonths: number | null;
  startDate: string | null;
  firstPaymentDate: string | null;
  paymentFrequency: string | null;
  paymentAmount: number | null;
  paymentDay: number | null;
  originalPrincipal: number | null;
  creditLimit: number | null;
  status: string;
  balance: number;
  notes: string | null;
}

export interface DebtScheduleRow {
  id: string;
  installmentNo: number;
  dueDate: string;
  payment: number;
  principal: number;
  interest: number;
  balanceAfter: number;
  status: string;
  paidOn: string | null;
  paidJournalId: string | null;
}

export interface Lease {
  id: string;
  leaseNumber: string;
  counterparty: string;
  commencement: string;
  end: string;
  currency: string;
  paymentFrequency: string;
  initialDirectCost: number;
  incentive: number;
  discountRate: number;
  rouAsset: number;
  liability: number;
  status: string;
}

export interface LeasePayment {
  id: string;
  paymentDate: string;
  amount: number;
  principal: number;
  interest: number;
  journalId: string | null;
  status: string;
}

export interface RevenueContract {
  id: string;
  contractNumber: string;
  customerId: string;
  customerName: string | null;
  contractDate: string;
  startDate: string | null;
  endDate: string | null;
  totalPrice: number;
  status: string;
}

export interface PerformanceObligation {
  id: string;
  code: string;
  description: string | null;
  standalonePrice: number;
  allocatedPrice: number;
  method: string;
  start: string | null;
  end: string | null;
  deferredAccountId: string | null;
  revenueAccountId: string | null;
}

export interface RevenueScheduleRow {
  id: string;
  obligationId: string;
  obligationCode: string;
  periodId: string | null;
  periodName: string | null;
  scheduledAmount: number;
  recognizedAmount: number;
  journalId: string | null;
  status: string;
}

export interface RecognitionSchedule {
  id: string;
  kind: string;
  name: string;
  totalAmount: number;
  startDate: string;
  months: number;
  method: string;
  balanceAccountId: string | null;
  balanceAccountName: string | null;
  plAccountId: string | null;
  plAccountName: string | null;
  vendorId: string | null;
  customerId: string | null;
  autoReverse: boolean;
  status: string;
}

export interface RecognitionLine {
  id: string;
  lineNo: number;
  recognizeOn: string;
  amount: number;
  status: string;
  journalEntryId: string | null;
  postedAt: string | null;
}

export function fmtMoney(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.slice(0, 10);
}
