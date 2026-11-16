import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/invoices/[id]/unbilled-time — registry
 *  time.invoice_unbilled → acct_invoice_unbilled_time RPC (doc 13):
 *  pulls the customer's unbilled billable time entries onto the
 *  invoice as lines and marks them invoiced. Body: { customerId,
 *  through?, invoiceDate? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.customerId) return err('VALIDATION', 'customerId is required', 400);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin().rpc('acct_invoice_unbilled_time', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_customer_id: String(body.customerId),
    p_through: body.through ? String(body.through) : today,
    p_invoice_id: id,
    p_invoice_date: body.invoiceDate ? String(body.invoiceDate) : today,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
