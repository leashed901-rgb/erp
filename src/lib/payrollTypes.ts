/**
 * Payroll module DTOs (doc 12). Shapes returned by /api/payroll/* —
 * screens consume these, never raw table rows.
 */

export interface Employee {
  id: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  hireDate: string | null;
  employmentType: string | null;
  payType: string | null;
  payRate: number | null;
  salaryAnnual: number | null;
  standardHoursWeek: number | null;
  taxFilingStatus: string | null;
  stateCode: string | null;
  paymentMethod: string | null;
  status: string;
  partyId: string | null;
}

export interface PayPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  frequency: string | null;
  status: string;
}

export interface PayRunItem {
  id: string;
  runId: string;
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusPay: number;
  grossPay: number;
  federalIncomeTax: number;
  stateIncomeTax: number;
  socialSecurityEe: number;
  medicareEe: number;
  pretaxDeductions: number;
  posttaxDeductions: number;
  netPay: number;
  paymentStatus: string | null;
}

export interface PayRun {
  id: string;
  runNumber: string | null;
  payPeriodId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  payDate: string | null;
  status: string;
  grossTotal: number;
  netTotal: number;
  employeeTaxTotal: number;
  employerTaxTotal: number;
  deductionTotal: number;
  employeeCount: number;
  glJournalEntryId: string | null;
  approvedAt: string | null;
  processedAt: string | null;
  items: PayRunItem[];
}

export interface Deduction {
  id: string;
  employeeId: string;
  employeeName: string;
  deductionCode: string;
  label: string;
  deductionType: string | null;
  isPretax: boolean;
  calcMethod: string | null;
  amount: number | null;
  percent: number | null;
  isActive: boolean;
}

export interface PayrollTaxForm {
  id: string;
  formType: string;
  taxYear: number;
  periodLabel: string | null;
  status: string;
  employeeId: string | null;
  vendorId: string | null;
  confirmationNumber: string | null;
  filedAt: string | null;
  documentUrl: string | null;
}

export interface ContractorInvite {
  id: string;
  email: string | null;
  name: string | null;
  status: string;
  createdAt: string;
}

/** A payroll time entry: an acct_time_entries row with billable=false.
 *  The time tables, verified live: acct_timesheets is a RETIRED view and
 *  payroll_timesheets is retired too — both writes raise "use
 *  acct_time_entries". acct_time_entries is the one canonical table; its
 *  billable=true rows are project time (the "Proof entry" design work),
 *  its billable=false rows with an employee_id are payroll time. */
export interface Timesheet {
  id: string;
  employeeId: string | null;
  employeeName: string;
  workDate: string | null;
  hours: number | null;
  rate: number | null;
  description: string | null;
  status: string;
  approvedAt: string | null;
}
