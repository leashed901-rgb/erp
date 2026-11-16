import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { PayrollTaxForm } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/payroll/tax-forms — W-2 / 941 / 940 forms and their status. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_payroll_tax_forms')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('tax_year', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: PayrollTaxForm[] = (data || []).map((r) => ({
    id: r.id,
    formType: r.form_type,
    taxYear: Number(r.tax_year),
    periodLabel: r.period_label,
    status: r.status,
    employeeId: r.employee_id,
    vendorId: r.vendor_id,
    confirmationNumber: r.confirmation_number,
    filedAt: r.filed_at,
    documentUrl: r.document_url,
  }));
  return NextResponse.json({ data: dtos });
}
