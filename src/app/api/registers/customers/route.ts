import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/customers — the accounting customer mirror
 * (Batch I, read-only here). acct_customers is the GL-facing copy of
 * a customer (customer number, legal name, AR account, payment
 * terms, party link). CRM customers live in crm_customers; this
 * register shows only the accounting mirror, which the tenant
 * currently has 0 rows of.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_customers').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('customer_number').limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      customerNumber: c.customer_number,
      legalName: c.legal_name,
      arAccountId: c.ar_account_id,
      paymentTermsDays: c.payment_terms_days,
      partyId: c.party_id,
    })),
  });
}
