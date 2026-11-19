import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/tax/filings — tax filings (acct_tax_filings), newest first. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_filings')
    .select('id, tax_rate_id, period_label, period_start, period_end, taxable_sales, tax_collected, tax_remitted, status, filed_at, confirmation_ref, entity_id, jurisdiction_id, exempt_sales, adjustments, amount_due, due_date, paid_on, payment_journal_id, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_start', { ascending: false });
  if (error) return err('LIST_FAILED', error.message, 500);
  return NextResponse.json({ data: data || [], meta: { total: (data || []).length } });
}
