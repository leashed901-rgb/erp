import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { DocumentType } from '@/lib/contracts';

const TABLE_MAP: Record<string, string> = {
  Invoice: 'acct_ar_invoices',
  Bill: 'acct_ap_bills',
  Estimate: 'acct_estimates',
  SalesReceipt: 'acct_ar_receipts',
  // erp_purchase_orders — the acct_ap_* PO tables are retired compat views.
  PurchaseOrder: 'erp_purchase_orders',
  SalesOrder: 'erp_orders',
  CreditMemo: 'acct_ar_credit_memos',
  VendorCredit: 'acct_ap_vendor_credits',
  Expense: 'acct_spend_transactions',
  JournalEntry: 'acct_journal_entries',
};

/** Line tables + their FK back to the parent, for DELETE / line reads. */
const LINE_TABLE_MAP: Record<string, string> = {
  Invoice: 'acct_ar_invoice_lines',
  Bill: 'acct_ap_bill_lines',
  PurchaseOrder: 'erp_purchase_order_lines',
  SalesOrder: 'erp_order_lines',
  Expense: 'acct_spend_lines',
};
const LINE_FK_MAP: Record<string, string> = {
  Invoice: 'invoice_id',
  Bill: 'bill_id',
  PurchaseOrder: 'purchase_order_id',
  SalesOrder: 'order_id',
  Expense: 'spend_id',
};
/** Line tables whose rows carry line_no (others: no stable row order). */
const LINE_ORDER_MAP: Record<string, string> = {
  Invoice: 'line_no',
  Bill: 'line_no',
  // erp PO lines have no line_no — created_at is the insertion order.
  PurchaseOrder: 'created_at',
  Expense: 'line_no',
};

/** GET /api/v1/documents/[id]?type=invoice[&include=lines] — single document. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const { data, error } = await supabaseAdmin().from(table).select('*').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).single();
  if (error || !data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found', requestId: crypto.randomUUID() } }, { status: 404 });
  if (searchParams.get('include') === 'lines' && LINE_TABLE_MAP[type]) {
    const orderCol = LINE_ORDER_MAP[type];
    let linesQuery = supabaseAdmin().from(LINE_TABLE_MAP[type]).select('*').eq(LINE_FK_MAP[type], id).eq('tenant_id', DEFAULT_TENANT_ID);
    if (orderCol) linesQuery = linesQuery.order(orderCol, { ascending: true });
    const { data: lines } = await linesQuery;
    return NextResponse.json({ data, lines: lines || [] });
  }
  // Batch F: estimates carry itemised rows in acct_estimate_lines (no
  // tenant_id column, so the generic query above cannot read them).
  // Rows win when they exist; the jsonb `lines` column is the fallback
  // for estimates created before the rows were written.
  if (searchParams.get('include') === 'lines' && type === 'Estimate') {
    const { data: estLines } = await supabaseAdmin()
      .from('acct_estimate_lines')
      .select('*')
      .eq('estimate_id', id)
      .order('line_number', { ascending: true });
    const rows = (estLines ?? []) as Record<string, unknown>[];
    const lines = rows.length > 0
      ? rows
      : ((data as Record<string, unknown>).lines as unknown[] | null) ?? [];
    return NextResponse.json({ data, lines });
  }
  return NextResponse.json({ data });
}

/** PATCH /api/v1/documents/[id]?type=invoice — update fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // erp_purchase_orders HAS updated_at, so it is set for every type.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Whitelist common updatable fields — the canonical acct_* column names
  // (invoice_number, estimate_date, …). open_balance is a GENERATED column
  // and must never be written. amount_paid is NOT whitelisted on purpose:
  // only the receive flow (take_payment / the receive verb) may move it —
  // a document save must never be able to zero a payment out.
  for (const f of ['status', 'subtotal', 'tax_total', 'total', 'notes', 'memo', 'due_date', 'terms', 'sent_at', 'paid_at', 'voided_at', 'void_reason', 'approval_status', 'review_status', 'payment_method', 'deposit_account_id', 'invoice_number', 'invoice_date', 'estimate_number', 'estimate_date', 'expiry_date', 'lines', 'bill_number', 'bill_date', 'receipt_number', 'receipt_date', 'po_number', 'order_date', 'expected_date', 'shipping_total']) {
    // erp_purchase_orders has no memo column — the screen's memo rides as
    // notes. Skip memo in the loop for PO and map it below. acct_ar_invoices
    // likewise has no memo column (invoices carry notes, not memo).
    if ((type === 'PurchaseOrder' || type === 'Invoice') && f === 'memo') continue;
    if (f in body) updates[f] = body[f];
  }
  if (type === 'PurchaseOrder' && 'memo' in body) updates.notes = body.memo;
  // 'lines' is a jsonb column on acct_estimates, but it is NOT a column
  // on any other parent table. For PurchaseOrder / Invoice / Bill it is
  // handled below (line replacement) and must not reach the parent update.
  const newLines = (type === 'PurchaseOrder' || type === 'Invoice' || type === 'Bill') && Array.isArray((updates as Record<string, unknown>).lines)
    ? ((updates as Record<string, unknown>).lines as Array<Record<string, unknown>>)
    : null;
  if (type === 'PurchaseOrder' || type === 'Invoice' || type === 'Bill') delete updates.lines;

  const { data, error } = await supabaseAdmin().from(table).update(updates).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error || !data) return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Not found', requestId: crypto.randomUUID() } }, { status: 400 });

  // Batch F: an Estimate PATCH carrying lines rewrites the itemised
  // rows in step with the jsonb column (the whitelist above already
  // updated the jsonb). Both stay in sync in the same request.
  if (type === 'Estimate' && Array.isArray(body.lines)) {
    const incoming = body.lines as Array<Record<string, unknown>>;
    const delErr = (await supabaseAdmin().from('acct_estimate_lines').delete().eq('estimate_id', id)).error;
    if (delErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Estimate lines could not be replaced: ${delErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    if (incoming.length > 0) {
      const estRows = incoming.map((l, i) => {
        const qtyN = Number(l.quantity ?? l.qty) || 1;
        const rateN = Number(l.unitPrice ?? l.unit_price ?? l.rate ?? l.unit_cost) || 0;
        return {
          estimate_id: id,
          line_number: i + 1,
          service_id: (l.service_id as string) || null,
          description: String(l.description || ''),
          quantity: qtyN,
          unit_price: rateN,
          discount_amount: Number(l.discount_amount ?? l.discountAmount ?? 0) || 0,
          tax_amount: Number(l.taxAmount ?? l.tax_amount) || 0,
          line_total: qtyN * rateN,
        };
      });
      const { error: insErr } = await supabaseAdmin().from('acct_estimate_lines').insert(estRows);
      if (insErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Estimate lines could not be saved: ${insErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    const { data: lines } = await supabaseAdmin().from('acct_estimate_lines').select('*').eq('estimate_id', id).order('line_number', { ascending: true });
    return NextResponse.json({ data, lines: lines || [] });
  }

  // PurchaseOrder line replacement: delete + re-insert in line_no order.
  // Received quantities ride on the incoming lines, so receiving is a
  // PATCH with the edited lines.
  if (type === 'PurchaseOrder' && newLines) {
    const delErr = (await supabaseAdmin().from('erp_purchase_order_lines').delete().eq('purchase_order_id', id).eq('tenant_id', DEFAULT_TENANT_ID)).error;
    if (delErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Lines could not be replaced: ${delErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    if (newLines.length > 0) {
      const lineRows = newLines.map((l, i) => ({
        tenant_id: DEFAULT_TENANT_ID,
        purchase_order_id: id,
        description: String(l.description || ''),
        quantity: Number(l.quantity ?? l.qty) || 1,
        quantity_ordered: Number(l.quantity ?? l.qty) || 1,
        quantity_received: Number(l.received_quantity ?? l.receivedQuantity ?? l.quantity_received ?? 0) || 0,
        unit_cost: Number(l.unitPrice ?? l.unit_price ?? l.unit_cost ?? l.rate) || 0,
        line_total: (Number(l.quantity ?? l.qty) || 1) * (Number(l.unitPrice ?? l.unit_price ?? l.unit_cost ?? l.rate) || 0),
        tax_amount: Number(l.taxAmount ?? l.tax_amount) || 0,
        sku_id: (l.sku_id as string) || null,
      }));
      const { error: insErr } = await supabaseAdmin().from('erp_purchase_order_lines').insert(lineRows);
      if (insErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Lines could not be saved: ${insErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    const { data: lines } = await supabaseAdmin().from('erp_purchase_order_lines').select('*').eq('purchase_order_id', id).eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: true });
    return NextResponse.json({ data, lines: lines || [] });
  }

  // Invoice / Bill line replacement: delete + re-insert in line_no order.
  // Only DRAFT documents may be re-lined — a posted invoice's lines are
  // what its journal was built on, so a save on a posted document keeps
  // its lines and only the header fields above move.
  if ((type === 'Invoice' || type === 'Bill') && newLines) {
    const row = data as Record<string, unknown>;
    if (row.status !== 'draft') return NextResponse.json({ data });
    const lineTable = LINE_TABLE_MAP[type];
    const lineFk = LINE_FK_MAP[type];
    const delErr = (await supabaseAdmin().from(lineTable).delete().eq(lineFk, id).eq('tenant_id', DEFAULT_TENANT_ID)).error;
    if (delErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Lines could not be replaced: ${delErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    if (newLines.length > 0) {
      const lineRows = newLines.map((l, i) => {
        const qtyN = Number(l.quantity ?? l.qty) || 1;
        const rateN = Number(l.unitPrice ?? l.unit_price ?? l.unit_cost ?? l.rate) || 0;
        const base: Record<string, unknown> = {
          tenant_id: DEFAULT_TENANT_ID,
          [lineFk]: id,
          line_no: i + 1,
          description: String(l.description || ''),
          quantity: qtyN,
          line_subtotal: qtyN * rateN,
          tax_amount: Number(l.taxAmount ?? l.tax_amount) || 0,
        };
        if (type === 'Invoice') {
          base.unit_price = rateN;
          base.discount_amount = Number(l.discount_amount ?? l.discountAmount ?? 0) || 0;
          base.item_id = (l.itemId as string) || null;
          base.sku = (l.sku as string) || null;
        } else {
          base.unit_cost = rateN;
          base.expense_account_id = (l.account_id as string) || (l.expense_account_id as string) || null;
        }
        return base;
      });
      const { error: insErr } = await supabaseAdmin().from(lineTable).insert(lineRows);
      if (insErr) return NextResponse.json({ error: { code: 'INTERNAL', message: `Lines could not be saved: ${insErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    const { data: lines } = await supabaseAdmin().from(lineTable).select('*').eq(lineFk, id).eq('tenant_id', DEFAULT_TENANT_ID).order('line_no', { ascending: true });
    return NextResponse.json({ data, lines: lines || [] });
  }
  return NextResponse.json({ data });
}

/** DELETE /api/v1/documents/[id]?type=invoice — delete (drafts only). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  // Delete the lines first — the parent row cannot be removed while its
  // line rows reference it.
  const lineTable = LINE_TABLE_MAP[type];
  if (lineTable) {
    const lineFk = LINE_FK_MAP[type];
    await supabaseAdmin().from(lineTable).delete().eq(lineFk, id).eq('tenant_id', DEFAULT_TENANT_ID);
  }
  // Batch F: estimate rows live in acct_estimate_lines (no tenant_id).
  if (type === 'Estimate') {
    await supabaseAdmin().from('acct_estimate_lines').delete().eq('estimate_id', id);
  }

  const { error } = await supabaseAdmin().from(table).delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: { id, deleted: true } });
}
