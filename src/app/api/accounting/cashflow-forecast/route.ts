import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Cash flow forecast inputs: today's real bank balances + every open
   AR invoice and AP bill with its due date. The screen buckets them
   into 30/60/90-day windows — no projection data is invented here. */
export async function GET() {
  const sb = supabaseAdmin();

  const [acctsRes, txnsRes, invRes, billsRes] = await Promise.all([
    sb
      .from('acct_bank_accounts')
      .select('id, name, masked_account_number, opening_balance')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('name'),
    sb
      .from('acct_bank_transactions')
      .select('bank_account_id, amount')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(10000),
    sb
      .from('acct_ar_invoices')
      .select('id, invoice_number, total, amount_paid, amount_credited, status, due_date')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(5000),
    sb
      .from('acct_ap_bills')
      .select('id, bill_number, vendor_id, total, amount_paid, status, due_date')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .neq('status', 'void')
      .limit(5000),
  ]);
  if (acctsRes.error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: acctsRes.error.message, requestId: crypto.randomUUID() } },
      { status: 500 }
    );
  }

  const txnsByAccount = new Map<string, number>();
  for (const t of (txnsRes.data || []) as { bank_account_id: string; amount: unknown }[]) {
    txnsByAccount.set(
      t.bank_account_id,
      (txnsByAccount.get(t.bank_account_id) || 0) + (Number(t.amount) || 0)
    );
  }
  const accounts = ((acctsRes.data || []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    name: String(a.name || ''),
    mask: (a.masked_account_number as string) || null,
    balance: (Number(a.opening_balance) || 0) + (txnsByAccount.get(String(a.id)) || 0),
  }));
  const cashOnHand = accounts.reduce((s, a) => s + a.balance, 0);

  const invoices = ((invRes.data || []) as Record<string, unknown>[])
    .map((i) => ({
      id: String(i.id),
      no: (i.invoice_number as string) || 'Invoice',
      amount: (Number(i.total) || 0) - (Number(i.amount_paid) || 0) - (Number(i.amount_credited) || 0),
      dueDate: (i.due_date as string) || null,
    }))
    .filter((i) => i.amount > 0.005 && i.dueDate);

  const vendorIds = [...new Set(((billsRes.data || []) as Record<string, unknown>[]).map((b) => String(b.vendor_id)))];
  const vendorNames = new Map<string, string>();
  if (vendorIds.length > 0) {
    const { data: vendors } = await sb
      .from('acct_vendors')
      .select('id, legal_name')
      .in('id', vendorIds);
    for (const v of (vendors || []) as { id: string; legal_name: string }[]) {
      vendorNames.set(v.id, v.legal_name);
    }
  }
  const bills = ((billsRes.data || []) as Record<string, unknown>[])
    .map((b) => ({
      id: String(b.id),
      no: (b.bill_number as string) || 'Bill',
      vendor: vendorNames.get(String(b.vendor_id)) || '',
      amount: (Number(b.total) || 0) - (Number(b.amount_paid) || 0),
      dueDate: (b.due_date as string) || null,
    }))
    .filter((b) => b.amount > 0.005 && b.dueDate);

  return NextResponse.json({
    data: {
      asOf: new Date().toISOString().slice(0, 10),
      cashOnHand,
      accounts,
      invoices,
      bills,
    },
  });
}
