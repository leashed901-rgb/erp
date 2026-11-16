import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Customers for finance pickers: crm_customers (the table
   acct_estimates.customer_id and acct_ar_invoices.customer_id
   actually reference). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_customers')
    .select('id, first_name, last_name, company_name, email')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('company_name')
    .limit(500);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: ((data || []) as Record<string, unknown>[]).map((c) => {
      const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
      return {
        id: String(c.id),
        displayName: (c.company_name as string) || person || 'Customer',
        email: (c.email as string) || null,
      };
    }),
  });
}
