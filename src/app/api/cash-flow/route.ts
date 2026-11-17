import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const DAY = 24 * 60 * 60 * 1000;

function windowIndex(dueDate: string, today: Date): number {
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.floor((due.getTime() - today.getTime()) / DAY);
  if (diff <= 30) return 0; // overdue + next 30 days
  if (diff <= 60) return 1;
  if (diff <= 90) return 2;
  return -1;
}

/** GET /api/cash-flow — the read-only cash-flow model (spec §2.6),
 *  built from live data: bank GL balances, open invoices, open bills,
 *  recurring templates, and scheduled payments. Windows are the next
 *  30 / 31–60 / 61–90 days. `late_invoice` is the largest open invoice
 *  — the what-if toggle shifts it from window 1 to window 2. */
export async function GET() {
  const sb = supabaseAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const wEnd = [new Date(today.getTime() + 30 * DAY), new Date(today.getTime() + 60 * DAY), new Date(today.getTime() + 90 * DAY)];

  // Cash on hand — GL balances of the tenant's bank accounts.
  let cashOnHand = 0;
  const { data: bankAccounts } = await sb
    .from('acct_bank_accounts')
    .select('id, name, gl_account_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true);
  const bankAccountNames: { name: string; balance: number }[] = [];
  for (const a of bankAccounts || []) {
    const { data: bal } = await sb.rpc('acct_account_balance', { p_account_id: a.gl_account_id });
    cashOnHand += Number(bal ?? 0);
    bankAccountNames.push({ name: a.name, balance: Number(bal ?? 0) });
  }

  const windows = [
    { id: 'w30', label: 'Next 30 days', moneyIn: 0, moneyOut: 0 },
    { id: 'w60', label: 'Days 31 – 60', moneyIn: 0, moneyOut: 0 },
    { id: 'w90', label: 'Days 61 – 90', moneyIn: 0, moneyOut: 0 },
  ];

  // Open invoices → money in, bucketed by due date.
  const { data: invoices, error: invErr } = await sb
    .from('acct_ar_invoices')
    .select('id, invoice_number, customer_id, due_date, total, open_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .gt('open_balance', 0)
    .order('due_date', { ascending: true });
  if (invErr) return err('INTERNAL', invErr.message, 500);
  let lateInvoice: Record<string, unknown> | null = null;
  for (const inv of invoices || []) {
    const w = windowIndex(inv.due_date, today);
    if (w >= 0) windows[w].moneyIn += Number(inv.open_balance);
    if (!lateInvoice || Number(inv.open_balance) > Number(lateInvoice.open_balance)) {
      lateInvoice = inv;
    }
  }

  // Open bills → money out.
  const { data: bills, error: billErr } = await sb
    .from('acct_ap_bills')
    .select('id, bill_number, vendor_id, due_date, total, open_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .gt('open_balance', 0)
    .order('due_date', { ascending: true });
  if (billErr) return err('INTERNAL', billErr.message, 500);
  for (const bill of bills || []) {
    const w = windowIndex(bill.due_date, today);
    if (w >= 0) windows[w].moneyOut += Number(bill.open_balance);
  }

  // Recurring invoice templates → money in. Each template contributes
  // one run per cycle inside the 90-day view (monthly steps +30d).
  const { data: recInv } = await sb
    .from('acct_recurring_invoices')
    .select('id, name, frequency, next_run_date, total, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'active');
  let recInvCount = 0;
  let recInvMonthly = 0;
  const stepDays = (freq: string) =>
    freq === 'weekly' ? 7 : freq === 'yearly' ? 365 : 30;
  for (const t of recInv || []) {
    recInvCount++;
    const total = Number(t.total);
    if ((t.frequency || 'monthly') === 'monthly') recInvMonthly += total;
    // Runs start at the next run date, or today if that date is past.
    let run = new Date(Math.max(new Date(t.next_run_date + 'T00:00:00').getTime(), today.getTime()));
    while (run <= wEnd[2]) {
      const w = windowIndex(fmt(run), today);
      if (w >= 0) windows[w].moneyIn += total;
      run = new Date(run.getTime() + stepDays(t.frequency || 'monthly') * DAY);
    }
  }

  // Recurring bill templates → money out (lines jsonb holds the amounts).
  const { data: recBills } = await sb
    .from('acct_recurring_bills')
    .select('id, name, frequency, next_run_date, lines, is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true);
  let recBillCount = 0;
  let recBillMonthly = 0;
  for (const t of recBills || []) {
    recBillCount++;
    const total = ((t.lines as { amount?: number }[]) || []).reduce(
      (s, l) => s + Number(l.amount || 0),
      0,
    );
    if ((t.frequency || 'monthly') === 'monthly') recBillMonthly += total;
    let run = new Date(Math.max(new Date(t.next_run_date + 'T00:00:00').getTime(), today.getTime()));
    while (run <= wEnd[2]) {
      const w = windowIndex(fmt(run), today);
      if (w >= 0) windows[w].moneyOut += total;
      run = new Date(run.getTime() + stepDays(t.frequency || 'monthly') * DAY);
    }
  }

  // Scheduled payments → money out on their date.
  const { data: scheduled } = await sb
    .from('acct_scheduled_payments')
    .select('id, amount, scheduled_date, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'scheduled');
  let scheduled30 = 0;
  for (const s of scheduled || []) {
    const w = windowIndex(s.scheduled_date, today);
    if (w >= 0) windows[w].moneyOut += Number(s.amount);
    if (w === 0) scheduled30 += Number(s.amount);
  }

  // Cumulative balances.
  let cumIn = 0;
  let cumOut = 0;
  const rows = windows.map((w) => {
    cumIn += w.moneyIn;
    cumOut += w.moneyOut;
    return { ...w, cumIn, cumOut, balance: cashOnHand + cumIn - cumOut };
  });

  return NextResponse.json({
    data: {
      cash_on_hand: cashOnHand,
      bank_accounts: bankAccountNames,
      as_of: fmt(today),
      windows: rows,
      late_invoice: lateInvoice
        ? {
            id: (lateInvoice as Record<string, unknown>).id,
            no: (lateInvoice as Record<string, unknown>).invoice_number,
            amount: Number((lateInvoice as Record<string, unknown>).open_balance),
            due: (lateInvoice as Record<string, unknown>).due_date,
          }
        : null,
      sources: [
        { key: 'invoices', label: 'Open invoices', detail: `${(invoices || []).length} invoices · $${(invoices || []).reduce((s, i) => s + Number(i.open_balance), 0).toFixed(2)} expected`, tone: 'in' },
        { key: 'bills', label: 'Open bills', detail: `${(bills || []).length} bills · $${(bills || []).reduce((s, b) => s + Number(b.open_balance), 0).toFixed(2)} due`, tone: 'out' },
        { key: 'recurring', label: 'Recurring templates', detail: `${recInvCount + recBillCount} templates · $${(recInvMonthly - recBillMonthly).toFixed(2)} / month net`, tone: 'in' },
        { key: 'scheduled', label: 'Scheduled payments', detail: `$${scheduled30.toFixed(2)} in the next 30 days`, tone: 'out' },
      ],
    },
  });
}
