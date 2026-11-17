import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/order-postings — the order → journal map
 * (Batch I, read-only). Written by a trigger from erp_orders, one
 * row per order: which journal recorded the sale, the amounts, and
 * whether the sale was reversed. Read this to trace an order's GL
 * footprint.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_order_postings').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false }).limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((o) => ({
      orderId: o.order_id,
      partyId: o.party_id,
      saleJournalId: o.sale_journal_id,
      saleAmount: o.sale_amount == null ? null : Number(o.sale_amount),
      taxAmount: o.tax_amount == null ? null : Number(o.tax_amount),
      saleReversed: o.sale_reversed,
      lastStatus: o.last_status,
      lastError: o.last_error,
    })),
  });
}
