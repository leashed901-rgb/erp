import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';

/* Create an expense (acct_spend_transactions draft + one
   acct_spend_lines line) from a receipt and link it back through
   acct_document_inbox.created_spend_id / spend.inbox_id. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const categoryAccountId = typeof body.categoryAccountId === 'string' ? body.categoryAccountId : null;
  const bankAccountId = typeof body.bankAccountId === 'string' ? body.bankAccountId : null;
  const total = typeof body.total === 'number' ? body.total : null;
  if (!categoryAccountId) return err('VALIDATION', 'categoryAccountId is required — pick a category first', 400);
  if (!bankAccountId) return err('VALIDATION', 'bankAccountId (payment account) is required', 400);
  if (total == null || total <= 0) return err('VALIDATION', 'a positive total is required', 400);
  const taxAmount = typeof body.taxAmount === 'number' ? body.taxAmount : 0;
  const entityId = await tenantEntityId();
  if (!entityId) return err('INTERNAL', 'No accounting entity exists for this tenant', 500);

  const sb = supabaseAdmin();
  const { data: inbox, error: readErr } = await sb
    .from('acct_document_inbox')
    .select('id, created_spend_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!inbox) return err('NOT_FOUND', 'Receipt not found', 404);
  if ((inbox as { created_spend_id: string | null }).created_spend_id) {
    return err('CONFLICT', 'An expense was already created from this receipt', 409);
  }

  const subtotal = Math.round((total - taxAmount) * 100) / 100;
  const { data: spend, error: spendErr } = await sb
    .from('acct_spend_transactions')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      txn_kind: 'expense',
      payee_name: typeof body.vendorName === 'string' ? body.vendorName : null,
      bank_account_id: bankAccountId,
      payment_date: typeof body.date === 'string' && body.date ? body.date : new Date().toISOString().slice(0, 10),
      print_status: 'not_applicable',
      currency: 'USD',
      subtotal,
      tax_total: taxAmount,
      total,
      status: 'draft',
      tags: [],
      inbox_id: id,
    })
    .select('id')
    .single();
  if (spendErr) return err('INTERNAL', spendErr.message, 500);
  const spendId = String((spend as { id: string }).id);

  const { error: lineErr } = await sb.from('acct_spend_lines').insert({
    tenant_id: DEFAULT_TENANT_ID,
    spend_id: spendId,
    line_no: 1,
    account_id: categoryAccountId,
    description: typeof body.vendorName === 'string' ? `Receipt — ${body.vendorName}` : 'Receipt expense',
    quantity: 1,
    rate: subtotal,
    amount: subtotal,
    tax_amount: taxAmount,
    billable: false,
    tags: [],
    dimensions: {},
  });
  if (lineErr) return err('INTERNAL', lineErr.message, 500);

  const { error: linkErr } = await sb
    .from('acct_document_inbox')
    .update({ created_spend_id: spendId, status: 'processed' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (linkErr) return err('INTERNAL', linkErr.message, 500);
  return NextResponse.json({ data: { id, spendId } }, { status: 201 });
}
