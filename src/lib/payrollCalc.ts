/**
 * Payroll item calculation for the Run payroll workspace.
 * Gross from hours/salary; employee FICA at statutory rates (SS 6.2%,
 * Medicare 1.45%); federal withholding via the IRS percentage method
 * (annualized, standard deduction, single/married brackets); employer
 * FICA match + FUTA 0.6% + SUTA 2.7%. The review step shows every figure
 * before the run is saved, and the saved row is what posts to the GL.
 */
import type { Employee, Deduction } from './payrollTypes';

export interface CalcInput {
  regularHours: number;
  overtimeHours: number;
  bonusPay: number;
}

export interface CalcResult {
  regularPay: number; overtimePay: number; bonusPay: number; grossPay: number;
  federalIncomeTax: number; stateIncomeTax: number;
  socialSecurityEe: number; medicareEe: number;
  socialSecurityEr: number; medicareEr: number; futaEr: number; sutaEr: number;
  pretaxDeductions: number; posttaxDeductions: number; netPay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
};

/** 2025 federal brackets (taxable income after standard deduction). */
const BRACKETS: Record<string, Array<[number, number]>> = {
  single: [[0.10, 11925], [0.12, 48475], [0.22, 103350], [0.24, 197300], [0.32, 250525], [0.35, 626350], [0.37, Infinity]],
  married_filing_jointly: [[0.10, 23850], [0.12, 96950], [0.22, 206700], [0.24, 394600], [0.32, 501050], [0.35, 751600], [0.37, Infinity]],
};
const STANDARD_DEDUCTION: Record<string, number> = { single: 15000, married_filing_jointly: 30000, married_filing_separately: 15000, head_of_household: 22500 };

function federalWithholding(annualGross: number, filingStatus: string | null, periods: number): number {
  const key = filingStatus && BRACKETS[filingStatus] ? filingStatus : 'single';
  let taxable = Math.max(0, annualGross - (STANDARD_DEDUCTION[key] || 15000));
  let tax = 0;
  let prevCap = 0;
  for (const [rate, cap] of BRACKETS[key]) {
    const slice = Math.min(taxable, cap) - prevCap;
    if (slice <= 0) break;
    tax += slice * rate;
    prevCap = cap;
    if (taxable <= cap) break;
  }
  return round2(tax / periods);
}

export function calcPayItem(
  employee: Employee,
  input: CalcInput,
  deductions: Deduction[],
  frequency: string | null,
): CalcResult {
  const periods = PERIODS_PER_YEAR[frequency || 'biweekly'] || 26;
  let regularPay = 0, overtimePay = 0;
  if (employee.payType === 'salary') {
    regularPay = round2((employee.salaryAnnual || 0) / periods);
  } else {
    const rate = employee.payRate || 0;
    regularPay = round2(input.regularHours * rate);
    overtimePay = round2(input.overtimeHours * rate * 1.5);
  }
  const bonusPay = round2(input.bonusPay || 0);
  const grossPay = round2(regularPay + overtimePay + bonusPay);

  const mine = deductions.filter(d => d.employeeId === employee.id && d.isActive);
  const dedAmount = (d: Deduction) =>
    d.calcMethod === 'percent_of_gross' ? round2(grossPay * ((d.percent || 0) / 100)) : round2(d.amount || 0);
  const pretaxDeductions = round2(mine.filter(d => d.isPretax).reduce((s, d) => s + dedAmount(d), 0));
  const posttaxDeductions = round2(mine.filter(d => !d.isPretax).reduce((s, d) => s + dedAmount(d), 0));

  // Only §125 cafeteria amounts (health premiums, HSA, FSA, dependent care)
  // are FICA-exempt. Retirement deferrals (401k/403b/IRA) reduce federal
  // income-tax wages but stay in the Social Security / Medicare base.
  const FICA_EXEMPT_TYPES = ['health_insurance', 'dental', 'vision', 'hsa', 'fsa'];
  const ficaExemptPretax = round2(mine
    .filter(d => d.isPretax && FICA_EXEMPT_TYPES.includes((d.deductionType || '').toLowerCase()))
    .reduce((s, d) => s + dedAmount(d), 0));
  const ficaBase = Math.max(0, grossPay - ficaExemptPretax);
  const socialSecurityEe = round2(ficaBase * 0.062);
  const medicareEe = round2(ficaBase * 0.0145);
  const federalIncomeTax = federalWithholding(Math.max(0, grossPay - pretaxDeductions) * periods, employee.taxFilingStatus, periods);
  const stateIncomeTax = 0; // TN has no wage income tax; other states configure via deductions

  const netPay = round2(grossPay - pretaxDeductions - federalIncomeTax - stateIncomeTax - socialSecurityEe - medicareEe - posttaxDeductions);

  return {
    regularPay, overtimePay, bonusPay, grossPay,
    federalIncomeTax, stateIncomeTax,
    socialSecurityEe, medicareEe,
    socialSecurityEr: socialSecurityEe, medicareEr: medicareEe,
    futaEr: round2(grossPay * 0.006), sutaEr: round2(grossPay * 0.027),
    pretaxDeductions, posttaxDeductions, netPay,
  };
}
