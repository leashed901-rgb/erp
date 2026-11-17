/**
 * Tax module DTOs (docs 10 business tax + 11 sales tax).
 * Shapes returned by /api/tax/* routes — the screens consume these,
 * never raw table rows.
 */

/* ── Doc 10: business tax ─────────────────────────────────── */

export interface TaxAccountRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  /** 'income' | 'cogs' | 'operating' — the Tax summary section. */
  section: 'income' | 'cogs' | 'operating';
  /** Signed YTD balance in the account's normal direction. */
  ytd: number;
  /** Balance for the current quarter of the tax year. */
  quarter: number;
  taxLineId: string | null;
  /** Resolved label from acct_tax_lines, e.g. "Gross receipts". */
  taxLineLabel: string | null;
  formLine: string | null;
  flagged: boolean;
  excluded: boolean;
}

export interface DeductionCategory {
  category: string;
  amount: number;
  pctDeductible: number;
  sourceCount: number;
}

export interface TaxAssetRow {
  id: string;
  name: string;
  originalCost: number;
  accumulatedDepreciation: number;
  bookValue: number;
  status: string;
  placedInService: string | null;
}

export interface TaxSummary {
  taxYear: number;
  entity: { id: string; legalName: string; displayName: string; entityType: string; taxIdentifier: string | null } | null;
  grossIncome: number;
  cogs: number;
  deductibleExpenses: number;
  deductions: DeductionCategory[];
  taxableProfit: number;
  federalRate: number;
  estimatedTax: number;
  accounts: TaxAccountRow[];
  assets: TaxAssetRow[];
  mapping: { mapped: number; total: number; unmapped: number };
  alerts: {
    uncategorizedTransactions: number;
    missingW9: number;
    unreconciledAccounts: number;
  };
  nextDeadline: { label: string; dueDate: string; amount: number | null } | null;
}

export interface TaxLineOption {
  id: string;
  form: string;
  line: string;
  label: string;
}

export interface Form1099 {
  vendorId: string;
  vendorName: string;
  tinLast4: string | null;
  w9Received: boolean;
  totalPaid: number;
  threshold: number;
  meetsThreshold: boolean;
  form: string;
  status: string;
}

export interface Summary1099 {
  taxYear: number;
  threshold: number;
  payees: Form1099[];
  missingW9Count: number;
  generatedCount: number;
}

export interface EfileFiling {
  id: string;
  formCode: string;
  stateCode: string | null;
  taxYear: number;
  periodLabel: string | null;
  dueDate: string | null;
  status: string;
  channel: string | null;
  recordCount: number | null;
  totalAmount: number | null;
  confirmationNumber: string | null;
  filedAt: string | null;
  blockingIssues: unknown;
  createdAt: string;
}

/* ── Doc 11: sales tax ────────────────────────────────────── */

export interface TaxJurisdiction {
  id: string;
  code: string | null;
  name: string;
  countryCode: string | null;
  stateCode: string | null;
  locality: string | null;
  registrationNumber: string | null;
  level: string | null;
  authorityName: string | null;
  filingFrequency: string | null;
  isActive: boolean;
}

export interface TaxCode {
  id: string;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  code: string;
  name: string;
  taxType: string;
  rate: number;
  recoverablePercent: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isCompound: boolean;
  isActive: boolean;
}

export interface TaxNexus {
  id: string;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  stateCode: string | null;
  nexusType: string;
  collectTax: boolean;
  registrationNumber: string | null;
  registeredOn: string | null;
  filingFrequency: string | null;
}

export interface NexusAlert {
  id: string;
  stateCode: string;
  status: string;
  windowLabel: string | null;
  countedSales: number;
  countedTxns: number;
  pctOfThreshold: number;
  resolution: string | null;
  lastCheckedAt: string | null;
}

export interface TaxExemption {
  id: string;
  customerId: string;
  customerName: string | null;
  jurisdictionId: string | null;
  reason: string | null;
  certificateNo: string | null;
  validFrom: string | null;
  validTo: string | null;
  verifiedAt: string | null;
}

export interface TaxTransaction {
  id: string;
  taxDate: string;
  direction: string;
  sourceDocType: string | null;
  jurisdictionId: string | null;
  taxCategory: string | null;
  grossAmount: number;
  taxableAmount: number;
  exemptAmount: number;
  rate: number;
  taxAmount: number;
  filingId: string | null;
}

/** A tax rate rule (acct_tax_rules). `rate` is a fraction (0.07 = 7%). */
export interface TaxRule {
  id: string;
  jurisdiction: string | null;
  taxType: string | null;
  stateCode: string | null;
  rate: number;
  taxCode: string | null;
  classification: string | null;
  autoCalc: boolean;
  isActive: boolean;
}

/** A taxability rule (acct_tax_taxability_rules). `rateOverride` is a fraction. */
export interface TaxabilityRule {
  id: string;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  taxCategory: string | null;
  treatment: string | null;
  rateOverride: number | null;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  appliesToChildren: boolean;
  direction: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  priority: number;
  name: string | null;
  legalReference: string | null;
  isActive: boolean;
}

export interface TaxFiling {
  id: string;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;
  taxRemitted: number;
  adjustments: number;
  amountDue: number;
  status: string;
  filedAt: string | null;
  paidOn: string | null;
  confirmationRef: string | null;
}

export interface MarketplaceRemittance {
  id: string;
  jurisdiction: string;
  periodStart: string | null;
  periodEnd: string | null;
  taxCollected: number;
  amountRemitted: number;
  status: string;
  confirmationNumber: string | null;
  filedAt: string | null;
}
