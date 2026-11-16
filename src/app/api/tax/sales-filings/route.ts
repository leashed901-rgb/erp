import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxFiling } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/sales-filings — sales tax filings by period (doc 11). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_tax_filings')
    .select('*, acct_tax_jurisdictions(name)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_start', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: TaxFiling[] = (data || []).map((r) => ({
    id: r.id,
    periodLabel: r.period_label,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    dueDate: r.due_date,
    jurisdictionId: r.jurisdiction_id,
    jurisdictionName: (r.acct_tax_jurisdictions as { name?: string } | null)?.name || null,
    taxableSales: Number(r.taxable_sales) || 0,
    exemptSales: Number(r.exempt_sales) || 0,
    taxCollected: Number(r.tax_collected) || 0,
    taxRemitted: Number(r.tax_remitted) || 0,
    adjustments: Number(r.adjustments) || 0,
    amountDue: Number(r.amount_due) || 0,
    status: r.status,
    filedAt: r.filed_at,
    paidOn: r.paid_on,
    confirmationRef: r.confirmation_ref,
  }));
  return NextResponse.json({ data: dtos });
}
