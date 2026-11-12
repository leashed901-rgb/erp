import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/send?type=invoice
 *  Marks the document as sent (status → 'sent', sets sent_at). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const TABLE_MAP: Record<string, string> = { Invoice: 'acct_ar_invoices', Bill: 'acct_ap_bills', Estimate: 'acct_estimates', PurchaseOrder: 'acct_ap_purchase_orders' };
  const table = TABLE_MAP[type || ''];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const { data, error } = await supabaseAdmin().from(table).update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, message: 'Document sent' });
}
