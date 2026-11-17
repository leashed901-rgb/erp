/**
 * Bank detail DTOs (doc 28 Batch D). Shapes returned by /api/bank-deposits,
 * /api/bank-transfers and /api/bank-statements — screens consume these,
 * never raw table rows.
 */

export interface BankDeposit {
  id: string;
  depositNumber: string;
  bankAccountId: string;
  bankAccountName: string;
  depositDate: string;
  memo: string | null;
  total: number;
  cashBackAmount: number;
  status: string;
  postedJournalId: string | null;
  bankTransactionId: string | null;
  lineCount: number;
}

export interface BankDepositLine {
  id: string;
  depositId: string;
  receiptId: string | null;
  accountId: string | null;
  accountName: string | null;
  receivedFrom: string | null;
  description: string | null;
  amount: number;
}

export interface BankTransfer {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  transferDate: string;
  amount: number;
  memo: string | null;
  status: string;
  journalEntryId: string | null;
  voidJournalId: string | null;
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  statementStart: string;
  statementEnd: string;
  openingBalance: number;
  closingBalance: number;
  importedAt: string | null;
  providerStatementId: string | null;
}
