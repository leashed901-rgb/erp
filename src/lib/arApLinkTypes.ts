/**
 * AR/AP link DTOs (doc 28 Batch E). Shapes returned by the applications,
 * collections, statements, addresses, aliases and order-payments routes.
 */

export interface ReceiptApplication {
  id: string;
  receiptId: string;
  receiptNumber: string;
  receiptDate: string;
  invoiceId: string;
  appliedAmount: number;
  asDeposit: boolean;
}

export interface CreditMemoApplication {
  id: string;
  creditMemoId: string;
  memoNumber: string;
  memoDate: string;
  invoiceId: string;
  amount: number;
  appliedOn: string;
  reversedAt: string | null;
}

export interface PaymentApplication {
  id: string;
  paymentId: string;
  checkNumber: string | null;
  paymentDate: string | null;
  billId: string;
  appliedAmount: number;
}

export interface VendorCreditApplication {
  id: string;
  creditId: string;
  creditNumber: string;
  creditDate: string;
  billId: string;
  amount: number;
  appliedOn: string;
}

export interface AvailableCredit {
  id: string;
  number: string;
  date: string;
  total: number;
  appliedAmount: number;
  remaining: number;
}

export interface CollectionsCase {
  id: string;
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  priority: string;
  status: string;
  assignedTo: string | null;
  nextActionAt: string | null;
  disputeAmount: number;
  reason: string | null;
  notes: string | null;
}

export interface CustomerStatement {
  id: string;
  customerId: string;
  customerName: string;
  statementNumber: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  chargesTotal: number;
  paymentsTotal: number;
  creditsTotal: number;
  closingBalance: number;
  agingCurrent: number;
  aging130: number;
  aging3160: number;
  aging6190: number;
  agingOver90: number;
  status: string;
  documentUrl: string | null;
  sentAt: string | null;
  generatedAt: string;
  reminderCount: number;
  lastReminderAt: string | null;
  batchId: string | null;
}

export interface StatementLine {
  lineDate: string;
  docType: string;
  docNumber: string;
  description: string;
  charges: number;
  payments: number;
  balance: number;
}

export interface StatementBatch {
  id: string;
  statementType: string;
  periodStart: string;
  periodEnd: string;
  customerFilter: string | null;
  customerIds: string[];
  status: string;
  statementCount: number;
  generatedAt: string | null;
  sentAt: string | null;
}

export interface PartyAddress {
  id: string;
  partyType: string;
  partyId: string;
  addressType: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

export interface VendorAlias {
  id: string;
  alias: string;
  matchType: string;
  vendorId: string | null;
  vendorName: string | null;
  customerId: string | null;
  customerName: string | null;
  accountId: string | null;
  accountName: string | null;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  kind: string;
  amount: number;
  fee: number;
  processor: string | null;
  processorRef: string | null;
  journalEntryId: string | null;
  createdAt: string;
}
