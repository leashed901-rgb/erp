import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';

/* Create an AP bill (acct_ap_bills, draft) from a receipt, finding or
   creating the vendor in acct_vendors with the same required-column
   pattern as the parties route (VND-#### sequence + the tenant's
   Accounts Payable account). Links back via inbox.created_bill_id
   and bill.inbox_id. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function findOrCreateVendor(sb: ReturnType<typeof supabaseAdmin>, name: string): Promise<string> {
  const { data: existing } = await sb
    .from('acct_vendors')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .ilike('legal_name', name)
    .limit(1);
  if (existing && existing.length) return String((existing[0] as { id: string }).id);

  const [numRes, apRes] = await Promise.all([
    sb.from('acct_vendors').select('vendor_number').eq('tenant_id', DEFAULT_TENANT_ID).like('vendor_number', 'VND-%'),
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).eq('subtype', 'accounts_payable').limit(1),
  ]);
  let nextNum = 1;
  for (const row of (numRes.data || []) as { vendor_number?: string }[]) {
    const m = /^VND-(\d+)$/.exec(row.vendor_number || '');
    if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
  }
  const apAccountId = (apRes.data?.[0] as { id?: string } | undefined)?.id;
  if (!apAccountId) throw new Error('No Accounts Payable account found in the chart of accounts');
  const { data, error } = await sb
    .from('acct_vendors')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      vendor_number: `VND-${String(nextNum).padStart(4, '0')}`,
      legal_name: name,
      currency: 'USD',
      ap_account_id: apAccountId,
      payment_terms_days: 30,
      is_1099_vendor: false,
      is_active: true,
      metadata: {},
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const vendorName = typeof body.vendorName === 'string' ? body.vendorName.trim() : '';
  const total = typeof body.total === 'number' ? body.total : null;
  if (!vendorName) return err('VALIDATION', 'vendorName is required', 400);
  if (total == null || total <= 0) return err('VALIDATION', 'a positive total is required', 400);
  const taxAmount = typeof body.taxAmount === 'number' ? body.taxAmount : 0;
  const entityId = await tenantEntityId();
  if (!entityId) return err('INTERNAL', 'No accounting entity exists for this tenant', 500);

  const sb = supabaseAdmin();
  const { data: inbox, error: readErr } = await sb
    .from('acct_document_inbox')
    .select('id, created_bill_id, vendor_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!inbox) return err('NOT_FOUND', 'Receipt not found', 404);
  const inboxRow = inbox as { created_bill_id: string | null; vendor_id: string | null };
  if (inboxRow.created_bill_id) return err('CONFLICT', 'A bill was already created from this receipt', 409);

  let vendorId = inboxRow.vendor_id;
  try {
    if (!vendorId) vendorId = await findOrCreateVendor(sb, vendorName);
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Vendor resolution failed', 500);
  }

  const billDate = typeof body.date === 'string' && body.date ? body.date : new Date().toISOString().slice(0, 10);
  const due = new Date(`${billDate}T00:00:00`);
  due.setDate(due.getDate() + 30);
  const billNumber = `B-${Date.now().toString(36).toUpperCase()}`;
  const { data: bill, error: billErr } = await sb
    .from('acct_ap_bills')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      vendor_id: vendorId,
      bill_number: billNumber,
      bill_date: billDate,
      due_date: due.toISOString().slice(0, 10),
      currency: 'USD',
      exchange_rate: 1,
      subtotal: Math.round((total - taxAmount) * 100) / 100,
      tax_total: taxAmount,
      discount_total: 0,
      total,
      amount_paid: 0,
      amount_credited: 0,
      status: 'draft',
      source: 'upload',
      review_status: 'for_review',
      approval_status: 'pending',
      payment_approval_status: 'pending',
      tags: [],
      inbox_id: id,
      /* open_balance is a generated column — never inserted */
    })
    .select('id, bill_number')
    .single();
  if (billErr) return err('INTERNAL', billErr.message, 500);
  const billId = String((bill as { id: string }).id);

  const { error: linkErr } = await sb
    .from('acct_document_inbox')
    .update({ created_bill_id: billId, vendor_id: vendorId })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (linkErr) return err('INTERNAL', linkErr.message, 500);
  return NextResponse.json({ data: { id, billId, billNumber } }, { status: 201 });
}
