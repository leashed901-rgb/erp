import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/convert?type=estimate&to=invoice
 *  Converts a document: Estimate → Invoice, SalesOrder → Invoice, Bill → VendorCredit.
 *  Tries the RPC (convert_sales_order_to_invoice) first; falls back to manual insert. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fromType = searchParams.get('type');
  const toType = searchParams.get('to') || 'invoice';

  // Try the RPC first (the cheap-wins list from the guide)
  const rpcMap: Record<string, string> = {
    'estimate→invoice': 'convert_estimate_to_invoice',
    'salesorder→invoice': 'convert_sales_order_to_invoice',
  };
  const rpcKey = `${(fromType || '').toLowerCase()}→${toType.toLowerCase()}`;
  const rpcName = rpcMap[rpcKey];

  if (rpcName) {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc(rpcName, { p_document_id: id, p_tenant_id: DEFAULT_TENANT_ID });
    if (!rpcError && rpcResult) {
      return NextResponse.json({ data: rpcResult, message: 'Converted via RPC' });
    }
    // RPC failed — fall through to manual conversion
  }

  // Manual conversion: read the source document, create the target document
  const SOURCE_TABLES: Record<string, string> = {
    estimate: 'acct_estimates',
    salesorder: 'erp_orders',
  };
  const TARGET_TABLES: Record<string, string> = {
    invoice: 'acct_ar_invoices',
    vendorcredit: 'acct_ap_vendor_credits',
  };
  const sourceTable = SOURCE_TABLES[(fromType || '').toLowerCase()];
  const targetTable = TARGET_TABLES[toType.toLowerCase()];
  if (!sourceTable || !targetTable) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: `Cannot convert ${fromType} → ${toType}`, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Read source
  const { data: source, error: sourceErr } = await supabaseAdmin().from(sourceTable).select('*').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).single();
  if (sourceErr || !source) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Source document not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }

  // Create target
  const newNumber = `${toType.substring(0, 3).toUpperCase()}-${Date.now()}`;
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    invoice_number: newNumber,
    invoice_date: new Date().toISOString().slice(0, 10),
    customer_id: source.customer_id || source.crm_customer_id,
    currency: source.currency || 'USD',
    subtotal: Number(source.subtotal) || 0,
    tax_total: Number(source.tax_total) || 0,
    total: Number(source.total) || 0,
    amount_paid: 0,
    open_balance: Number(source.total) || 0,
    status: 'draft',
    notes: source.notes || null,
  };

  const { data: newDoc, error: createErr } = await supabaseAdmin().from(targetTable).insert(insert).select('*').single();
  if (createErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: createErr.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Mark source as converted
  if (sourceTable === 'acct_estimates') {
    await supabaseAdmin().from(sourceTable).update({ status: 'converted', converted_invoice_id: newDoc.id }).eq('id', id);
  }

  return NextResponse.json({ data: newDoc, message: `${fromType} converted to ${toType}` });
}
