import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { DocumentType } from '@/lib/contracts';

/**
 * The Document Engine API (spec §B.4.4).
 *
 * One family: /api/v1/documents?type=invoice
 * Type-specific rules come from DocumentDef, not separate routes.
 *
 * Table mapping (the REAL accounting tables):
 *   Invoice       → acct_ar_invoices + acct_ar_invoice_lines
 *   Bill          → acct_ap_bills + acct_ap_bill_lines
 *   Estimate      → acct_estimates
 *   SalesReceipt  → acct_ar_receipts
 *   PurchaseOrder → acct_ap_purchase_orders
 *   SalesOrder    → erp_orders + erp_order_lines
 *   CreditMemo    → acct_ar_credit_memos
 *   VendorCredit  → acct_ap_vendor_credits
 *   Expense       → acct_spend_transactions + acct_spend_lines
 *   JournalEntry  → acct_journal_entries
 */

const TABLE_MAP: Record<string, { table: string; lineTable?: string; numberField: string; dateField: string; partyField: string; idField: string; lineFkField?: string }> = {
  Invoice: { table: 'acct_ar_invoices', lineTable: 'acct_ar_invoice_lines', numberField: 'invoice_number', dateField: 'invoice_date', partyField: 'customer_id', idField: 'id', lineFkField: 'invoice_id' },
  Bill: { table: 'acct_ap_bills', lineTable: 'acct_ap_bill_lines', numberField: 'bill_number', dateField: 'bill_date', partyField: 'vendor_id', idField: 'id', lineFkField: 'bill_id' },
  Estimate: { table: 'acct_estimates', numberField: 'estimate_number', dateField: 'estimate_date', partyField: 'customer_id', idField: 'id' },
  SalesReceipt: { table: 'acct_ar_receipts', numberField: 'receipt_number', dateField: 'receipt_date', partyField: 'customer_id', idField: 'id' },
  PurchaseOrder: { table: 'acct_ap_purchase_orders', numberField: 'po_number', dateField: 'order_date', partyField: 'vendor_id', idField: 'id' },
  SalesOrder: { table: 'erp_orders', lineTable: 'erp_order_lines', numberField: 'order_number', dateField: 'order_date', partyField: 'crm_customer_id', idField: 'id', lineFkField: 'order_id' },
  CreditMemo: { table: 'acct_ar_credit_memos', numberField: 'credit_memo_number', dateField: 'credit_memo_date', partyField: 'customer_id', idField: 'id' },
  VendorCredit: { table: 'acct_ap_vendor_credits', numberField: 'vendor_credit_number', dateField: 'vendor_credit_date', partyField: 'vendor_id', idField: 'id' },
  Expense: { table: 'acct_spend_transactions', lineTable: 'acct_spend_lines', numberField: 'transaction_number', dateField: 'transaction_date', partyField: 'payee_id', idField: 'id', lineFkField: 'spend_id' },
  JournalEntry: { table: 'acct_journal_entries', numberField: 'entry_number', dateField: 'entry_date', partyField: '', idField: 'id' },
};

/** GET /api/v1/documents?type=invoice&customer_id=xxx
 *  Lists documents of a type, optionally filtered by party. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType | null;
  const customerId = searchParams.get('customer_id');
  const vendorId = searchParams.get('vendor_id');

  if (!type || !TABLE_MAP[type]) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const config = TABLE_MAP[type];
  let query = supabaseAdmin()
    .from(config.table)
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (customerId) query = query.eq(config.partyField, customerId);
  if (vendorId) query = query.eq(config.partyField, vendorId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data, meta: { type, table: config.table } });
}

/** POST /api/v1/documents
 *  Creates a document. Body: { type, partyId, lines, ... }
 *  Routes to the correct table based on type. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const type = body.type as DocumentType;
  if (!type || !TABLE_MAP[type]) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const config = TABLE_MAP[type];
  const partyId = body.partyId as string | undefined;
  if (!partyId && config.partyField) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: `${config.partyField} is required`, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Build the insert row for this document type
  const number = body.number as string || `${type.substring(0, 3).toUpperCase()}-${Date.now()}`;
  const date = body.date as string || new Date().toISOString().slice(0, 10);
  const subtotal = Number(body.subtotal) || 0;
  const taxTotal = Number(body.taxTotal || body.tax_total) || 0;
  const total = Number(body.total) || subtotal + taxTotal;

  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    [config.numberField]: number,
    [config.dateField]: date,
    currency: body.currency || 'USD',
    subtotal,
    tax_total: taxTotal,
    total,
    status: body.status || 'draft',
  };

  if (config.partyField) {
    insert[config.partyField] = partyId;
  }

  // Type-specific fields
  if (type === 'Invoice') {
    insert.due_date = body.dueDate || null;
    insert.notes = body.notes || null;
    insert.open_balance = total;
    insert.amount_paid = 0;
  }
  if (type === 'Bill') {
    insert.due_date = body.dueDate || null;
    insert.memo = body.memo || null;
    insert.open_balance = total;
    insert.amount_paid = 0;
    insert.approval_status = 'pending';
  }
  if (type === 'Estimate') {
    insert.expiry_date = body.expiryDate || null;
    insert.terms = body.terms || null;
    insert.notes = body.notes || null;
  }
  if (type === 'SalesReceipt') {
    insert.amount = total;
    insert.payment_method = body.paymentMethod || 'cash';
    insert.status = 'settled';
  }
  if (type === 'SalesOrder') {
    insert.due_date = body.dueDate || null;
    insert.balance_due = total;
    insert.fulfillment_method = body.fulfillmentMethod || 'stock';
  }

  const { data, error } = await supabaseAdmin()
    .from(config.table)
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Insert line items if provided
  const lines = body.lines as Array<Record<string, unknown>> | undefined;
  if (lines && lines.length > 0 && config.lineTable && config.lineFkField && data) {
    const lineRows = lines.map((line, i) => ({
      tenant_id: DEFAULT_TENANT_ID,
      [config.lineFkField!]: data.id,
      line_no: i + 1,
      description: String(line.description || ''),
      quantity: Number(line.quantity) || 1,
      unit_price: Number(line.unitPrice || line.unit_price || line.rate) || 0,
      line_subtotal: Number(line.totalPrice || line.amount || (Number(line.quantity || 1) * Number(line.unitPrice || line.rate || 0))) || 0,
      tax_amount: Number(line.taxAmount || 0) || 0,
    }));
    await supabaseAdmin().from(config.lineTable).insert(lineRows);
  }

  // Notify surfaces that a document was saved
  return NextResponse.json({ data, meta: { type, table: config.table } }, { status: 201 });
}
