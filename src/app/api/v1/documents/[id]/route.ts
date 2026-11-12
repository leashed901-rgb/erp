import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { DocumentType } from '@/lib/contracts';

const TABLE_MAP: Record<string, string> = {
  Invoice: 'acct_ar_invoices',
  Bill: 'acct_ap_bills',
  Estimate: 'acct_estimates',
  SalesReceipt: 'acct_ar_receipts',
  PurchaseOrder: 'acct_ap_purchase_orders',
  SalesOrder: 'erp_orders',
  CreditMemo: 'acct_ar_credit_memos',
  VendorCredit: 'acct_ap_vendor_credits',
  Expense: 'acct_spend_transactions',
  JournalEntry: 'acct_journal_entries',
};

/** GET /api/v1/documents/[id]?type=invoice — single document. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const { data, error } = await supabaseAdmin().from(table).select('*').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).single();
  if (error || !data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found', requestId: crypto.randomUUID() } }, { status: 404 });
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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Whitelist common updatable fields
  for (const f of ['status', 'subtotal', 'tax_total', 'total', 'amount_paid', 'open_balance', 'notes', 'memo', 'due_date', 'terms', 'sent_at', 'paid_at', 'voided_at', 'void_reason', 'approval_status', 'payment_method', 'deposit_account_id']) {
    if (f in body) updates[f] = body[f];
  }

  const { data, error } = await supabaseAdmin().from(table).update(updates).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error || !data) return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Not found', requestId: crypto.randomUUID() } }, { status: 400 });
  return NextResponse.json({ data });
}

/** DELETE /api/v1/documents/[id]?type=invoice — delete (drafts only). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as DocumentType;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid type required', requestId: crypto.randomUUID() } }, { status: 400 });

  const { error } = await supabaseAdmin().from(table).delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: { id, deleted: true } });
}
