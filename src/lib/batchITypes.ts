/**
 * Batch I (doc 28) — budgets, dimensions, reference tables.
 * DTOs + small formatters shared by the Batch I screens.
 * Money renders with a leading minus sign (ASCII '-') for negatives in
 * code paths, and the UI uses the U+2212 minus in display strings —
 * keep them distinct: fmtMoney is display, num() is parse.
 * Every interface here matches its route's response shape exactly;
 * do not add fields the route does not return.
 */

export interface BudgetVersion {
  id: string;
  name: string;
  fiscalYear: number;
  versionNo: number;
  scenario: string;
  status: string;
  currency: string;
  approvedBy: string | null;
  approvedAt: string | null;
  lineCount: number;
  total: number;
}

export interface BudgetLine {
  id: string;
  budgetId: string;
  periodId: string;
  periodName: string;
  periodStart: string | null;
  accountId: string;
  account: string;
  amount: number;
  dimensions: Record<string, unknown>;
  notes: string | null;
}

export interface BudgetVsActualRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
}

export interface Dimension {
  id: string;
  code: string;
  name: string;
  dataType: string;
  isRequired: boolean;
  isActive: boolean;
  valueCount: number;
}

export interface DimensionValue {
  id: string;
  dimensionId: string;
  code: string;
  name: string;
  parentValueId: string | null;
  isActive: boolean;
}

export interface DimensionRule {
  id: string;
  accountId: string;
  account: string;
  dimensionId: string;
  dimension: string;
  isRequired: boolean;
  allowedValues: unknown;
}

export interface ExpenseReport {
  id: string;
  employeeId: string | null;
  employee: string;
  reportNumber: string;
  reportDate: string;
  currency: string;
  totalAmount: number;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  postedJournalId: string | null;
  lineCount: number;
}

export interface ExpenseLine {
  id: string;
  expenseDate: string;
  merchant: string | null;
  description: string;
  amount: number;
  taxAmount: number;
  expenseAccountId: string;
  account: string;
}

export interface RecurringInvoice {
  id: string;
  customerId: string | null;
  customer: string;
  templateNumber: string | null;
  name: string;
  frequency: string;
  intervalCount: number;
  nextRunDate: string;
  currency: string;
  totalAmount: number;
  status: string;
  lineCount: number;
}

export interface RecurringInvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  lineTotal: number;
}

export interface RecurringBill {
  id: string;
  vendorId: string;
  vendor: string;
  name: string;
  frequency: string;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  autoPost: boolean;
  autoPay: boolean;
  autoPayMethod: string | null;
  autoPayBankAccountId: string | null;
  isActive: boolean;
  lineCount: number;
  totalAmount: number;
}

export interface RecurringJournal {
  id: string;
  bookId: string;
  book: string;
  name: string;
  frequency: string;
  intervalN: number;
  nextRunDate: string;
  active: boolean;
  template: unknown;
}

export interface PriceBook {
  id: string;
  code: string;
  title: string;
  method: string | null;
  qualifyingTerms: string | null;
  catalogScope: string | null;
  isActive: boolean;
  lineCount: number;
}

export interface PriceBookLine {
  id: string;
  catalogProductId: string | null;
  product: string | null;
  sku: string | null;
  channel: string | null;
  basePrice: number | null;
  overridePrice: number | null;
}

export interface Allocation {
  id: string;
  name: string;
  allocationType: string | null;
  sourceAccountId: string | null;
  sourceAccount: string;
  driverDimensionId: string | null;
  driverDimension: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  active: boolean;
  ruleCount: number;
}

export interface AllocationRule {
  id: string;
  destinationAccountId: string | null;
  destinationAccount: string;
  percentage: number | null;
  fixedAmount: number | null;
  dimensions: Record<string, unknown>;
}

export interface ConsolidationGroup {
  id: string;
  code: string;
  name: string;
  reportingCurrency: string;
  consolidationMethod: string | null;
  memberCount: number;
  runCount: number;
}

export interface ConsolidationMember {
  id: string;
  entityId: string;
  entity: string;
  ownershipPercent: number | null;
  consolidationPercent: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface ConsolidationRun {
  id: string;
  groupId: string;
  group: string;
  periodId: string;
  period: string;
  status: string;
  reportingCurrency: string;
  fxAdjustment: number | null;
  eliminationAmount: number | null;
  journalId: string | null;
}

export interface IntercompanyPartner {
  id: string;
  fromEntityId: string;
  fromEntity: string;
  toEntityId: string;
  toEntity: string;
  dueFromAccountId: string | null;
  dueToAccountId: string | null;
  markupPercent: number | null;
  isActive: boolean;
}

export interface IntercompanyTxn {
  id: string;
  fromEntityId: string;
  fromEntity: string;
  toEntityId: string;
  toEntity: string;
  transactionDate: string;
  currency: string;
  amount: number;
  status: string;
  fromJournalId: string | null;
  toJournalId: string | null;
  eliminationRequired: boolean;
}

export interface FxRun {
  id: string;
  bookId: string | null;
  periodId: string | null;
  revaluationDate: string;
  status: string;
  journalId: string | null;
}

export interface KpiDefinition {
  id: string;
  code: string;
  name: string;
  formula: string;
  unit: string;
  sortOrder: number;
  isActive: boolean;
}

export interface KpiValue {
  code: string;
  name: string;
  unit: string;
  value: number | null;
  priorValue: number | null;
  formula: string;
}

export interface Workflow {
  id: string;
  name: string;
  entityType: string;
  thresholdAmount: number | null;
  rules: Record<string, unknown>;
  isActive: boolean;
  instanceCount: number;
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  workflow: string;
  entityType: string;
  entityId: string;
  status: string;
  currentStep: number;
  startedAt: string;
  completedAt: string | null;
}

export interface WorkflowAction {
  id: string;
  stepNo: number;
  approverId: string | null;
  approver: string;
  action: string;
  comments: string | null;
  actedAt: string;
}

export interface Control {
  id: string;
  controlCode: string;
  domain: string;
  process: string;
  policyRule: string | null;
  threshold: unknown;
  ownerRole: string | null;
  enforcement: string | null;
  frequency: string | null;
  status: string;
}

export interface PaymentTerm {
  id: string;
  code: string;
  name: string;
  dueDays: number;
  discountDays: number | null;
  discountPercent: number | null;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string | null;
  minorUnits: number;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  rateDate: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateType: string | null;
  source: string | null;
}

export interface RefundPolicy {
  id: string;
  windowDays: number | null;
  restockingFeePercent: number | null;
  requireApprovalAbove: number | null;
  autoApproveBelow: number | null;
  notes: string | null;
}

export interface TransactionTemplate {
  id: string;
  name: string;
  lines: unknown;
  parameters: unknown;
  isAdjusting: boolean;
  autoReverse: boolean;
  isActive: boolean;
}

export interface BookAccountMapping {
  id: string;
  sourceAccountId: string | null;
  sourceAccount: string;
  targetBookId: string | null;
  targetBook: string;
  targetAccountId: string | null;
  targetAccount: string;
}

export interface ChannelAccount {
  id: string;
  entityId: string;
  channel: string;
  clearingRegisterId: string;
  payoutBankAccountId: string | null;
  payoutBankAccount: string;
  feeAccountId: string | null;
  feeAccount: string;
  advertisingAccountId: string | null;
  advertisingAccount: string;
  shippingAccountId: string | null;
  shippingAccount: string;
  reserveAccountId: string | null;
  reserveAccount: string;
  isActive: boolean;
}

export interface ChannelSettlementLine {
  id: string;
  settlementId: string;
  lineType: string;
  amount: number;
  erpOrderId: string | null;
  orderNumber: string | null;
  accountId: string | null;
  account: string;
}

export interface ReportPackage {
  id: string;
  name: string;
  sections: string[];
  fluxAmountThreshold: number | null;
  fluxPctThreshold: number | null;
  recipients: string[];
}

export interface AccountRoleRow {
  id: string;
  entityId: string;
  role: string;
  accountId: string | null;
  account: string;
}

export interface AccountBalanceRow {
  id: string;
  entityId: string;
  bookId: string;
  accountId: string;
  account: string;
  periodId: string;
  period: string;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface NumberSequenceRow {
  entityId: string;
  docType: string;
  prefix: string;
  nextValue: number;
  padding: number;
}

export interface OrderPostingRow {
  orderId: string;
  partyId: string | null;
  saleJournalId: string | null;
  saleAmount: number | null;
  taxAmount: number | null;
  saleReversed: boolean;
  lastStatus: string | null;
  lastError: string | null;
}

export interface GatewayClearingRow {
  id: string;
  gateway: string;
  grossAmount: number;
  feeAmount: number;
  reserveAmount: number;
  netAmount: number;
  state: string;
}

export interface ProcessorEventRow {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: string;
  attempts: number;
}

export interface AttachmentRow {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  storagePath: string;
  mime: string | null;
  size: number | null;
  sha256: string | null;
}

export interface AcctCustomerRow {
  id: string;
  customerNumber: string | null;
  legalName: string | null;
  arAccountId: string | null;
  paymentTermsDays: number | null;
  partyId: string | null;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
}

export function cap(s: string | null | undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
