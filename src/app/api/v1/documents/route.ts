import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveTaxJurisdictionId } from '@/lib/taxEngine';
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
 *   PurchaseOrder → erp_purchase_orders + erp_purchase_order_lines
 *     (acct_ap_purchase_orders / _lines are RETIRED compat views — always
 *     empty, and writes raise "is retired; use erp_purchase_orders".)
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
  PurchaseOrder: { table: 'erp_purchase_orders', lineTable: 'erp_purchase_order_lines', numberField: 'po_number', dateField: 'order_date', partyField: 'vendor_id', idField: 'id', lineFkField: 'purchase_order_id' },
  SalesOrder: { table: 'erp_orders', lineTable: 'erp_order_lines', numberField: 'order_number', dateField: 'order_date', partyField: 'crm_customer_id', idField: 'id', lineFkField: 'order_id' },
  CreditMemo: { table: 'acct_ar_credit_memos', numberField: 'memo_number', dateField: 'memo_date', partyField: 'customer_id', idField: 'id' },
  VendorCredit: { table: 'acct_ap_vendor_credits', lineTable: 'acct_ap_vendor_credit_lines', numberField: 'credit_number', dateField: 'credit_date', partyField: 'vendor_id', idField: 'id', lineFkField: 'credit_id' },
  Expense: { table: 'acct_spend_transactions', lineTable: 'acct_spend_lines', numberField: 'transaction_number', dateField: 'payment_date', partyField: 'payee_id', idField: 'id', lineFkField: 'spend_id' },
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
  // Honor the list contract the TableShell sends — q, status, sort,
  // order. This GET previously ignored all of them, so on the
  // Invoices/Bills screens search, the status tabs and column sorting
  // silently did nothing (found 2026-11-15).
  const status = searchParams.get('status');
  const q = searchParams.get('q');
  const sortParam = searchParams.get('sort');
  const orderParam = searchParams.get('order');
  const SORTABLE = new Set([
    config.numberField, config.dateField, 'due_date', 'total', 'subtotal',
    'open_balance', 'status', 'created_at', 'amount_paid', 'bill_date',
    'invoice_date', 'estimate_date', 'receipt_date', 'order_date', 'memo_date',
  ]);
  const sortCol = sortParam && SORTABLE.has(sortParam) ? sortParam : config.dateField;
  const ascending = orderParam ? orderParam === 'asc' : false;
  let query = supabaseAdmin()
    .from(config.table)
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order(sortCol, { ascending })
    .limit(100);

  if (customerId) query = query.eq(config.partyField, customerId);
  if (vendorId) query = query.eq(config.partyField, vendorId);
  // Statuses are stored lowercase ('open', 'partially_paid') while the
  // view defs' tabs send 'OPEN'/'PAID' — match case-insensitively.
  if (status) query = query.ilike('status', status);
  if (q) query = query.ilike(config.numberField, `%${q}%`);

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

  // Totals are computed server-side from the lines when lines are present
  // (DocumentTotals) — client totals are only a fallback for line-less
  // creates (e.g. a bare bill from an upload). Never trust body totals
  // over the lines the user actually entered.
  const lines = body.lines as Array<Record<string, unknown>> | undefined;
  const lineTotals = (lines && lines.length > 0)
    ? lines.reduce(
        (acc: { subtotal: number; tax: number }, l) => {
          const qty = Number(l.quantity ?? l.qty) || 1;
          const rate = Number(l.unitPrice ?? l.unit_price ?? l.rate ?? l.unit_cost) || 0;
          const lineAmount = Number(l.totalPrice ?? l.amount ?? qty * rate) || 0;
          return {
            subtotal: acc.subtotal + lineAmount,
            tax: acc.tax + (Number(l.taxAmount ?? l.tax_amount) || 0),
          };
        },
        { subtotal: 0, tax: 0 },
      )
    : null;
  const subtotal = lineTotals ? lineTotals.subtotal : Number(body.subtotal) || 0;
  const taxTotal = lineTotals ? lineTotals.tax : Number(body.taxTotal || body.tax_total) || 0;
  const total = lineTotals ? subtotal + taxTotal : Number(body.total) || subtotal + taxTotal;

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
  // NOTE: open_balance is a GENERATED column (total - amount_paid -
  // amount_credited) on acct_ar_invoices / acct_ap_bills — never insert it.
  if (type === 'Invoice') {
    insert.due_date = body.dueDate || null;
    insert.notes = body.notes || null;
    insert.amount_paid = 0;
    // Sales tax (pack 5): acct_post_invoice computes tax through
    // acct_calculate_tax only when the invoice carries a jurisdiction.
    // Resolve it from the ship-to state (the customer's state decides
    // the tax), falling back to the tenant's configured default
    // jurisdiction in acct_settings. ship_to_state also feeds the
    // nexus exposure counters (tax_us_sales_by_state).
    const shipState = (body.shipToState || body.ship_to_state) as string | undefined;
    if (shipState) {
      insert.ship_to_state = String(shipState).toUpperCase();
      insert.ship_to_country = 'US';
    }
    insert.tax_jurisdiction_id = await resolveTaxJurisdictionId(supabaseAdmin(), {
      jurisdictionId: (body.taxJurisdictionId || body.tax_jurisdiction_id) as string | undefined,
      stateCode: shipState,
    });
  }
  if (type === 'Bill') {
    insert.due_date = body.dueDate || null;
    insert.memo = body.memo || null;
    insert.amount_paid = 0;
    insert.approval_status = 'pending';
  }
  if (type === 'Estimate') {
    insert.expiry_date = body.expiryDate || null;
    insert.terms = body.terms || null;
    insert.notes = body.notes || null;
    // acct_estimates carries its lines as a jsonb column (there is also a
    // separate acct_estimate_lines table for itemised rows).
    if (lines && lines.length > 0) {
      insert.lines = lines.map((l) => ({
        description: String(l.description || ''),
        quantity: Number(l.quantity ?? l.qty) || 1,
        unit_price: Number(l.unitPrice ?? l.unit_price ?? l.rate) || 0,
        amount: Number(l.totalPrice ?? l.amount ?? 0) || 0,
      }));
    }
  }
  if (type === 'SalesReceipt') {
    insert.amount = total;
    insert.payment_method = body.paymentMethod || 'cash';
    insert.status = 'settled';
  }
  if (type === 'PurchaseOrder') {
    insert.expected_date = body.dueDate || body.expectedDate || null;
    // erp_purchase_orders carries notes (not memo) and shipping_total, and
    // its total is the vendor-facing grand total including shipping.
    insert.notes = body.memo || body.notes || null;
    const shippingTotal = Number(body.shipping) || 0;
    insert.shipping_total = shippingTotal;
    insert.total = subtotal + taxTotal + shippingTotal;
    // erp status is free text; 'ordered' is the table default and the
    // screen's "Open". Anything else the caller sends passes through.
    if (!body.status) insert.status = 'ordered';
  }
  if (type === 'SalesOrder') {
    // erp_orders has no due_date column — the order's due/promise
    // timestamp is promised_at. Setting due_date made every SalesOrder
    // create fail with a schema-cache 500.
    insert.promised_at = body.dueDate || null;
    insert.balance_due = total;
    insert.fulfillment_method = body.fulfillmentMethod || 'stock';
    // erp_orders.metadata is NOT NULL — the storefront checkout passes
    // {} explicitly; the generic create must too.
    insert.metadata = body.metadata || {};
  }
  // Batch E: credit documents could never be created or posted.
  // VendorCredit has no subtotal/tax_total columns (the unconditional
  // insert 500d), and neither credit type got an entity_id — so
  // acct_post_credit_memo raised on the sales_returns role lookup.
  if (type === 'VendorCredit') {
    delete insert.subtotal;
    delete insert.tax_total;
    insert.applied_amount = 0;
    const { data: entityId } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityId) insert.entity_id = entityId;
  }
  if (type === 'CreditMemo') {
    const { data: entityId } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityId) insert.entity_id = entityId;
    const firstLine = lines?.[0] as Record<string, unknown> | undefined;
    const firstAccount = (firstLine?.revenue_account_id as string) || (firstLine?.account_id as string) || null;
    if (firstAccount) insert.revenue_account_id = firstAccount;
  }

  const { data, error } = await supabaseAdmin()
    .from(config.table)
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Batch F: estimates also carry itemised rows in acct_estimate_lines
  // (the jsonb `lines` column on the parent stays — screens read it
  // today; the rows are the canonical itemised store). The table has
  // NO tenant_id column, so the generic line mapper below cannot
  // handle it — insert here, same payload, same totals.
  if (type === 'Estimate' && lines && lines.length > 0 && data) {
    const estRows = lines.map((line, i) => {
      const qtyN = Number(line.quantity ?? line.qty) || 1;
      const rateN = Number(line.unitPrice ?? line.unit_price ?? line.rate ?? line.unit_cost) || 0;
      return {
        estimate_id: data.id,
        line_number: i + 1,
        service_id: (line.service_id as string) || null,
        description: String(line.description || ''),
        quantity: qtyN,
        unit_price: rateN,
        discount_amount: Number(line.discount_amount ?? line.discountAmount ?? 0) || 0,
        tax_amount: Number(line.taxAmount ?? line.tax_amount) || 0,
        line_total: qtyN * rateN,
      };
    });
    const { error: estErr } = await supabaseAdmin().from('acct_estimate_lines').insert(estRows);
    if (estErr) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: `Estimate lines could not be saved: ${estErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
  }

  // Insert line items if provided (reuses the `lines` parsed above).
  // The line tables have DIFFERENT columns per type — a generic row
  // silently fails on every one of them (the old code ignored the
  // insert error, so bills were created with no lines and could never
  // post: "Bill has no lines"). Map per type and surface failures.
  //
  // SKU resolution (module 3): the DocumentEngine picker now sends
  // sku_id + itemId per line. Older clients send itemId only — resolve
  // it against acct_items.sku_id so PO/sales-order lines never save
  // with sku_id NULL (unreceivable POs, no COGS on sales).
  const itemIds = [...new Set((lines || []).map((l) => (l as Record<string, unknown>).itemId as string).filter(Boolean))];
  const skuByItem = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: items } = await supabaseAdmin().from('acct_items').select('id, sku_id').in('id', itemIds);
    for (const it of (items || []) as { id: string; sku_id: string | null }[]) {
      if (it.sku_id) skuByItem.set(it.id, it.sku_id);
    }
  }
  const lineSku = (line: Record<string, unknown>): string | null =>
    (line.sku_id as string) || (line.itemId ? skuByItem.get(String(line.itemId)) || null : null);

  if (lines && lines.length > 0 && config.lineTable && config.lineFkField && data) {
    const qty = (l: Record<string, unknown>) => Number(l.quantity ?? l.qty) || 1;
    // Per-unit price. When the caller gave only a line amount, derive
    // the unit price from it — the DB triggers recompute line_subtotal
    // as quantity × unit price, so a 0 unit price zeroes the line (and
    // the parent total) even when the amount was given.
    const rate = (l: Record<string, unknown>) => {
      const explicit = Number(l.unitPrice ?? l.unit_price ?? l.rate ?? l.unit_cost);
      if (explicit) return explicit;
      const amt = Number(l.totalPrice ?? l.amount);
      if (amt) return amt / qty(l);
      return 0;
    };
    const amount = (l: Record<string, unknown>) => qty(l) * rate(l);
    const accountId = (l: Record<string, unknown>) =>
      (l.account_id as string) || (l.expense_account_id as string) || (l.revenue_account_id as string) || null;
    const lineRows = lines.map((line, i) => {
      // erp_purchase_order_lines: tenant_id IS present here (unlike the
      // retired acct view lines), but there is no line_no, no
      // expense_account_id and no received_quantity — receiving is
      // quantity_received, and ordering is by created_at.
      if (type === 'PurchaseOrder') {
        return {
          tenant_id: DEFAULT_TENANT_ID,
          [config.lineFkField!]: data.id,
          description: String(line.description || ''),
          quantity: qty(line),
          quantity_ordered: qty(line),
          quantity_received: Number(line.received_quantity ?? line.receivedQuantity ?? 0) || 0,
          unit_cost: rate(line),
          line_total: qty(line) * rate(line),
          tax_amount: Number(line.taxAmount ?? line.tax_amount) || 0,
          sku_id: lineSku(line),
        };
      }
      const base = {
        tenant_id: DEFAULT_TENANT_ID,
        [config.lineFkField!]: data.id,
        description: String(line.description || ''),
        quantity: qty(line),
        tax_amount: Number(line.taxAmount ?? line.tax_amount) || 0,
      };
      if (type === 'Bill') {
        return {
          ...base,
          line_no: i + 1,
          unit_cost: rate(line),
          line_subtotal: amount(line),
          expense_account_id: accountId(line),
        };
      }
      if (type === 'Invoice') {
        return {
          ...base,
          line_no: i + 1,
          unit_price: rate(line),
          line_subtotal: amount(line),
          revenue_account_id: accountId(line),
        };
      }
      if (type === 'Expense') {
        return {
          ...base,
          line_no: i + 1,
          account_id: accountId(line),
          rate: rate(line),
          amount: amount(line),
        };
      }
      if (type === 'VendorCredit') {
        // acct_ap_vendor_credit_lines has no tax_amount column — build
        // the row without the shared base.
        return {
          tenant_id: DEFAULT_TENANT_ID,
          [config.lineFkField!]: data.id,
          line_no: i + 1,
          account_id: accountId(line),
          description: String(line.description || ''),
          quantity: qty(line),
          amount: amount(line),
        };
      }
      // SalesOrder (erp_order_lines has line_total, no line_no, and a
      // NOT NULL status with no default — new lines start 'pending',
      // the same vocabulary checkout/webhook rows carry).
      return {
        ...base,
        unit_price: rate(line),
        line_total: amount(line),
        sku_id: lineSku(line),
        status: 'pending',
      };
    });
    const { error: lineErr } = await supabaseAdmin().from(config.lineTable).insert(lineRows);
    if (lineErr) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: `Lines could not be saved: ${lineErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
  }

  // Notify surfaces that a document was saved
  return NextResponse.json({ data, meta: { type, table: config.table } }, { status: 201 });
}
