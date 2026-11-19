import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/void?type=invoice
 *  Registry action `invoice.void` → RPC `acct_void_invoice` for invoices
 *  (reverses the posting if one exists).
 *  Body: { reason: string, void_date?: string }
 *  Falls back to a direct status update if the RPC rejects the row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // PurchaseOrder lives in erp_purchase_orders (the acct_ap_* table is an
  // empty compat shell — voiding there found no row). SalesOrder was
  // missing entirely, so the Orders workbench's cancel always 400'd.
  const TABLE_MAP: Record<string, string> = { Invoice: 'acct_ar_invoices', Bill: 'acct_ap_bills', Estimate: 'acct_estimates', SalesReceipt: 'acct_ar_receipts', PurchaseOrder: 'erp_purchase_orders', SalesOrder: 'erp_orders' };
  const table = TABLE_MAP[type || ''];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const reason = String(body.reason || 'Voided by user');

  if (table === 'acct_ar_invoices') {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_void_invoice', {
      p_invoice_id: id,
      p_reason: reason,
      p_void_date: (body.void_date as string) || null,
    });
    if (!rpcError && rpcResult) {
      return NextResponse.json({ data: { id, receipt_id: rpcResult }, message: 'Document voided' });
    }
    // RPC rejected the row — fall through to the direct update below.
  }

  // create.void (registry → app_void) for the types the engine can void:
  // a bill or sales receipt void must reverse its posting, not just flip
  // the status. Estimates and purchase orders have no engine void, so
  // they keep the direct status update below.
  const APP_VOID_TYPE: Record<string, string> = { Bill: 'bill', SalesReceipt: 'sales_receipt' };
  const voidType = APP_VOID_TYPE[type || ''];
  if (voidType) {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('app_void', {
      p_doc_type: voidType,
      p_id: id,
      p_reason: reason,
      p_date: (body.void_date as string) || null,
    });
    if (!rpcError) {
      return NextResponse.json({ data: { id, result: rpcResult }, message: 'Document voided' });
    }
    // RPC rejected the row — fall through to the direct update below.
  }

  // The erp tables have no voided_at/void_reason columns and no 'void'
  // status — voiding an order or PO is a cancellation there.
  const isErp = table === 'erp_orders' || table === 'erp_purchase_orders';
  const { data, error } = await supabaseAdmin().from(table).update(
    isErp
      ? { status: 'cancelled', updated_at: new Date().toISOString() }
      : {
          status: 'void',
          voided_at: new Date().toISOString(),
          void_reason: reason,
          updated_at: new Date().toISOString(),
        },
  ).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, message: 'Document voided' });
}
