import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/void?type=invoice
 *  Voids the document (status → 'void', sets voided_at + void_reason).
 *  Body: { reason: string } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const TABLE_MAP: Record<string, string> = { Invoice: 'acct_ar_invoices', Bill: 'acct_ap_bills', Estimate: 'acct_estimates', SalesReceipt: 'acct_ar_receipts', PurchaseOrder: 'acct_ap_purchase_orders' };
  const table = TABLE_MAP[type || ''];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const { data, error } = await supabaseAdmin().from(table).update({
    status: 'void',
    voided_at: new Date().toISOString(),
    void_reason: body.reason || 'Voided by user',
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, message: 'Document voided' });
}
