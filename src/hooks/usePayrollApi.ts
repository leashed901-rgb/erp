'use client';
/**
 * Payroll hooks (doc 12) — real /api/payroll/* routes via the shared
 * resilient fetch layer.
 */
import { fetchJson, useList } from './useCrmApi';
import { useOne } from './useTaxApi';
import type { Employee, PayPeriod, PayRun, Deduction, PayrollTaxForm, ContractorInvite } from '@/lib/payrollTypes';

export type { Employee, PayPeriod, PayRun, Deduction, PayrollTaxForm, ContractorInvite } from '@/lib/payrollTypes';

const unwrap = <T,>(raw: unknown): T[] => ((raw as { data: T[] })?.data || []) as T[];

export function useEmployees() {
  return useList<Employee>('payrollEmployees', '/api/payroll/employees', unwrap<Employee>);
}

export function usePayPeriods() {
  return useList<PayPeriod>('payPeriods', '/api/payroll/periods', unwrap<PayPeriod>);
}

export function usePayRuns() {
  return useList<PayRun>('payRuns', '/api/payroll/runs', unwrap<PayRun>);
}

export function usePayRun(id: string | null) {
  return useOne<PayRun>(`payRun:${id}`, id ? `/api/payroll/runs/${id}` : null);
}

export function useDeductions() {
  return useList<Deduction>('payrollDeductions', '/api/payroll/deductions', unwrap<Deduction>);
}

export function usePayrollTaxForms() {
  return useList<PayrollTaxForm>('payrollTaxForms', '/api/payroll/tax-forms', unwrap<PayrollTaxForm>);
}

export function useContractors() {
  return useList<ContractorInvite>('payrollContractors', '/api/payroll/contractors', unwrap<ContractorInvite>);
}

export const payrollMutations = {
  createEmployee: (body: Record<string, unknown>) =>
    fetchJson<{ data: Employee }>('/api/payroll/employees', { method: 'POST', body: JSON.stringify(body) }),
  updateEmployee: (id: string, body: Record<string, unknown>) =>
    fetchJson<{ data: Employee }>(`/api/payroll/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createPeriod: (body: Record<string, unknown>) =>
    fetchJson<{ data: PayPeriod }>('/api/payroll/periods', { method: 'POST', body: JSON.stringify(body) }),
  createRun: (body: Record<string, unknown>) =>
    fetchJson<{ data: PayRun }>('/api/payroll/runs', { method: 'POST', body: JSON.stringify(body) }),
  setRunStatus: (id: string, status: 'approved' | 'draft') =>
    fetchJson(`/api/payroll/runs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  postRun: (id: string, body: Record<string, unknown> = {}) =>
    fetchJson(`/api/payroll/runs/${id}/post`, { method: 'POST', body: JSON.stringify(body) }),
  createDeduction: (body: Record<string, unknown>) =>
    fetchJson('/api/payroll/deductions', { method: 'POST', body: JSON.stringify(body) }),
};
