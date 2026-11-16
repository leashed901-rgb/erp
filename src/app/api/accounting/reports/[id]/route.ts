import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Standard reports computed live from the general ledger
   (acct_journal_entries/lines, posted + non-reversal only, the
   same balance math as the chart of accounts) plus the AR/AP/tax
   subledgers. Rows come back in the viewer's shape:
   { kind: 'section'|'sub'|'total'|'final', label?, cells[] }. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const TITLES: Record<string, string> = {
  pnl: 'Profit and Loss',
  bs: 'Balance Sheet',
  cashflow: 'Statement of Cash Flows',
  araging: 'A/R Aging Summary',
  apaging: 'A/P Aging Summary',
  salesbycustomer: 'Sales by Customer Summary',
  expensesbyvendor: 'Expenses by Vendor Summary',
  gl: 'General Ledger',
  tb: 'Trial Balance',
  salestax: 'Sales Tax Liability',
  'monthly-pnl': 'Monthly P&L',
  'sales-funnel': 'Sales Funnel',
  'bill-funnel': 'Bill Funnel',
  'spend-by-category': 'Spend by Category',
  'bank-feed-review': 'Bank Feed Review',
  'bank-feed-stages': 'Bank Feed Stages',
  'tasks-due': 'Close Tasks Due',
  undeposited: 'Undeposited Payments',
  'account-list': 'Account List',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) =>
  n === 0 ? '$0.00' : `${n < 0 ? '−' : ''}$${Math.abs(round2(n)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtOrDash = (n: number) => (round2(n) === 0 ? '—' : fmt(n));
const fmtLong = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Acct {
  id: string;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  normal: string;
  opening: number;
}
interface Row {
  kind: 'section' | 'sub' | 'total' | 'final';
  label?: string;
  cells: string[];
}

type Sb = ReturnType<typeof supabaseAdmin>;

async function loadLedger(sb: Sb) {
  const [{ data: coa }, { data: entries }, { data: lines }] = await Promise.all([
    sb.from('acct_chart_of_accounts').select('id, name, code, account_type, subtype, normal_balance, opening_balance').eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('acct_journal_entries').select('id, entry_date, memo, reference').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'posted').is('reversal_of_id', null),
    sb.from('acct_journal_lines').select('account_id, journal_entry_id, debit, credit, description, line_no').eq('tenant_id', DEFAULT_TENANT_ID).limit(10000),
  ]);
  const accounts: Acct[] = ((coa || []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    name: String(a.name || ''),
    code: (a.code as string) || null,
    type: String(a.account_type || ''),
    subtype: (a.subtype as string) || null,
    normal: String(a.normal_balance || 'debit'),
    opening: Number(a.opening_balance || 0),
  }));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const entryById = new Map(((entries || []) as Record<string, unknown>[]).map((e) => [String(e.id), e]));
  const glLines = ((lines || []) as Record<string, unknown>[])
    .filter((l) => entryById.has(String(l.journal_entry_id)))
    .map((l) => ({
      accountId: String(l.account_id),
      entryId: String(l.journal_entry_id),
      date: String(entryById.get(String(l.journal_entry_id))?.entry_date || ''),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: (l.description as string) || (entryById.get(String(l.journal_entry_id))?.memo as string) || (entryById.get(String(l.journal_entry_id))?.reference as string) || '',
      lineNo: Number(l.line_no || 0),
    }));
  /* signed movement (in the account's normal direction) for a window */
  const movement = (accountId: string, from: string | null, to: string | null) => {
    const acct = acctById.get(accountId);
    if (!acct) return 0;
    let sum = 0;
    for (const l of glLines) {
      if (l.accountId !== accountId) continue;
      if (from && l.date < from) continue;
      if (to && l.date > to) continue;
      sum += acct.normal === 'credit' ? l.credit - l.debit : l.debit - l.credit;
    }
    return round2(sum);
  };
  const balanceAsOf = (a: Acct, to: string) => round2(a.opening + movement(a.id, null, to));
  return { accounts, acctById, glLines, movement, balanceAsOf };
}

function buildPnl(L: Awaited<ReturnType<typeof loadLedger>>, from: string, to: string, compare: boolean, pct: boolean) {
  const ytdFrom = `${to.slice(0, 4)}-01-01`;
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const priorTo = addDays(from, -1);
  const priorFrom = addDays(priorTo, -(days - 1));
  const windows: { label: string; from: string; to: string }[] = [
    { label: `${fmtLong(from)} – ${fmtLong(to)}`, from, to },
    { label: `YTD ${to.slice(0, 4)}`, from: ytdFrom, to },
  ];
  if (compare) windows.push({ label: 'Prior period', from: priorFrom, to: priorTo });
  const cols = ['', ...windows.map((w) => w.label), ...(pct ? ['% of income'] : [])];

  const revenue = L.accounts.filter((a) => a.type === 'revenue');
  const cogs = L.accounts.filter((a) => a.type === 'expense' && a.subtype === 'cogs');
  const expenses = L.accounts.filter((a) => a.type === 'expense' && a.subtype !== 'cogs');
  const vals = (a: Acct) => windows.map((w) => L.movement(a.id, w.from, w.to));
  const sumVals = (list: Acct[]) => windows.map((_, i) => round2(list.reduce((acc, a) => acc + vals(a)[i], 0)));
  const totalIncome = sumVals(revenue);
  const withPct = (cells: string[], periodVal: number) =>
    pct ? [...cells, totalIncome[0] !== 0 ? `${((periodVal / totalIncome[0]) * 100).toFixed(1)}%` : '—'] : cells;

  const rows: Row[] = [];
  const section = (label: string, list: Acct[], totalLabel: string) => {
    rows.push({ kind: 'section', cells: [label, ...windows.map(() => ''), ...(pct ? [''] : [])] });
    for (const a of list) {
      const v = vals(a);
      rows.push({ kind: 'sub', cells: withPct([a.name, ...v.map(fmt)], v[0]) });
    }
    const t = sumVals(list);
    rows.push({ kind: 'total', label: totalLabel, cells: withPct(t.map(fmt), t[0]) });
    return t;
  };
  const inc = section('Income', revenue, 'Total income');
  let gross = inc;
  if (cogs.length) {
    const c = section('Cost of goods sold', cogs, 'Total COGS');
    gross = inc.map((v, i) => round2(v - c[i]));
    rows.push({ kind: 'total', label: 'Gross profit', cells: withPct(gross.map(fmt), gross[0]) });
  }
  const exp = section('Expenses', expenses, 'Total expenses');
  const net = gross.map((v, i) => round2(v - exp[i]));
  rows.push({ kind: 'final', label: 'Net operating income', cells: withPct(net.map(fmt), net[0]) });
  return { cols, rows };
}

function buildBs(L: Awaited<ReturnType<typeof loadLedger>>, to: string) {
  const groups: { label: string; types: string[]; totalLabel: string }[] = [
    { label: 'Assets', types: ['asset', 'contra_asset'], totalLabel: 'Total assets' },
    { label: 'Liabilities', types: ['liability', 'contra_liability'], totalLabel: 'Total liabilities' },
    { label: 'Equity', types: ['equity', 'contra_equity'], totalLabel: 'Total equity' },
  ];
  const rows: Row[] = [];
  let liabEquity = 0;
  for (const g of groups) {
    rows.push({ kind: 'section', cells: [g.label, ''] });
    let total = 0;
    for (const a of L.accounts.filter((x) => g.types.includes(x.type))) {
      const bal = L.balanceAsOf(a, to);
      if (bal === 0) continue;
      total += bal;
      rows.push({ kind: 'sub', cells: [a.name, fmt(bal)] });
    }
    total = round2(total);
    if (g.label !== 'Assets') liabEquity += total;
    rows.push({ kind: 'total', label: g.totalLabel, cells: [fmt(total)] });
  }
  rows.push({ kind: 'final', label: 'Total liabilities + equity', cells: [fmt(liabEquity)] });
  return { cols: ['', `As of ${fmtLong(to)}`], rows };
}

function buildTb(L: Awaited<ReturnType<typeof loadLedger>>, to: string) {
  const rows: Row[] = [{ kind: 'section', cells: ['Account', 'Debit', 'Credit'] }];
  let td = 0;
  let tc = 0;
  for (const a of L.accounts) {
    const bal = L.balanceAsOf(a, to);
    if (bal === 0) continue;
    const debitSide = (a.normal === 'debit' && bal >= 0) || (a.normal === 'credit' && bal < 0);
    const amt = Math.abs(bal);
    if (debitSide) td += amt;
    else tc += amt;
    rows.push({
      kind: 'sub',
      cells: [`${a.code ? `${a.code} · ` : ''}${a.name}`, debitSide ? fmt(amt) : '—', debitSide ? '—' : fmt(amt)],
    });
  }
  rows.push({ kind: 'final', label: 'Total', cells: [fmt(td), fmt(tc)] });
  return { cols: ['Account', 'Debit', 'Credit'], rows };
}

function buildGl(L: Awaited<ReturnType<typeof loadLedger>>, from: string, to: string) {
  const rows: Row[] = [{ kind: 'section', cells: ['Date', 'Description', 'Account', 'Debit', 'Credit'] }];
  let td = 0;
  let tc = 0;
  const lines = L.glLines
    .filter((l) => l.date >= from && l.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.lineNo - b.lineNo)
    .slice(0, 500);
  for (const l of lines) {
    td += l.debit;
    tc += l.credit;
    const acct = L.acctById.get(l.accountId);
    rows.push({
      kind: 'sub',
      cells: [
        new Date(`${l.date}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
        l.description,
        acct ? acct.name : '',
        l.debit ? fmt(l.debit) : '—',
        l.credit ? fmt(l.credit) : '—',
      ],
    });
  }
  rows.push({ kind: 'final', label: 'Total for period', cells: ['', '', fmt(td), fmt(tc)] });
  return { cols: ['Date', 'Description', 'Account', 'Debit', 'Credit'], rows };
}

function buildCashflow(L: Awaited<ReturnType<typeof loadLedger>>, bankGlIds: Set<string>, from: string, to: string) {
  const revenue = L.accounts.filter((a) => a.type === 'revenue');
  const cogs = L.accounts.filter((a) => a.type === 'expense' && a.subtype === 'cogs');
  const expenses = L.accounts.filter((a) => a.type === 'expense' && a.subtype !== 'cogs');
  const sum = (list: Acct[], f: string | null, t: string | null) => round2(list.reduce((acc, a) => acc + L.movement(a.id, f, t), 0));
  const netIncome = round2(sum(revenue, from, to) - sum(cogs, from, to) - sum(expenses, from, to));
  const bankAccts = L.accounts.filter((a) => bankGlIds.has(a.id));
  const cashBegin = round2(bankAccts.reduce((acc, a) => acc + a.opening + L.movement(a.id, null, addDays(from, -1)), 0));
  const netChange = round2(bankAccts.reduce((acc, a) => acc + L.movement(a.id, from, to), 0));
  const rows: Row[] = [
    { kind: 'section', cells: ['Operating activities', ''] },
    { kind: 'sub', cells: ['Net income', fmt(netIncome)] },
    { kind: 'section', cells: ['Cash', ''] },
    { kind: 'sub', cells: ['Cash, beginning of period', fmt(cashBegin)] },
    { kind: 'sub', cells: ['Net change in cash', fmt(netChange)] },
    { kind: 'final', label: 'Cash, end of period', cells: [fmt(round2(cashBegin + netChange))] },
  ];
  return { cols: ['', `${fmtLong(from)} – ${fmtLong(to)}`], rows };
}

/* Batch A — the acct_v_* report views, read straight off the views.
   Every view is tenant-scoped; the month filters use the view's month
   column (date_trunc of posting_date / invoice_date). */
async function buildViewReport(sb: Sb, id: string, from: string, to: string): Promise<{ cols: string[]; rows: Row[] }> {
  const fmtMonth = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const fmtDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };
  const rows: Row[] = [];
  if (id === 'monthly-pnl') {
    const { data, error } = await sb.from('acct_v_monthly_pnl').select('month, income, spend, net_income, prior_year_net_income').eq('tenant_id', DEFAULT_TENANT_ID).order('month', { ascending: false }).limit(24);
    if (error) throw new Error(error.message);
    rows.push({ kind: 'section', cells: ['Month', 'Income', 'Spend', 'Net income', 'Prior-year net'] });
    let ti = 0;
    let ts = 0;
    let tn = 0;
    for (const r of (data || []) as Record<string, unknown>[]) {
      ti += Number(r.income || 0);
      ts += Number(r.spend || 0);
      tn += Number(r.net_income || 0);
      rows.push({ kind: 'sub', cells: [fmtMonth(String(r.month || '')), fmt(Number(r.income || 0)), fmt(Number(r.spend || 0)), fmt(Number(r.net_income || 0)), r.prior_year_net_income == null ? '—' : fmt(Number(r.prior_year_net_income))] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(ti), fmt(ts), fmt(tn), ''] });
    return { cols: ['Month', 'Income', 'Spend', 'Net income', 'Prior-year net'], rows };
  }
  if (id === 'sales-funnel') {
    const { data, error } = await sb.from('acct_v_sales_funnel').select('stage, invoice_count, total_amount, open_amount').eq('tenant_id', DEFAULT_TENANT_ID).limit(5000);
    if (error) throw new Error(error.message);
    const order = ['draft', 'not_paid', 'overdue', 'deposited', 'paid'];
    const byStage = new Map<string, { count: number; total: number; open: number }>();
    for (const r of (data || []) as Record<string, unknown>[]) {
      const cur = byStage.get(String(r.stage)) || { count: 0, total: 0, open: 0 };
      cur.count += Number(r.invoice_count || 0);
      cur.total += Number(r.total_amount || 0);
      cur.open += Number(r.open_amount || 0);
      byStage.set(String(r.stage), cur);
    }
    rows.push({ kind: 'section', cells: ['Stage', 'Invoices', 'Total', 'Open'] });
    let tc = 0;
    let tt = 0;
    let to2 = 0;
    for (const stage of [...byStage.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
      const v = byStage.get(stage)!;
      tc += v.count;
      tt += v.total;
      to2 += v.open;
      rows.push({ kind: 'sub', cells: [stage, String(v.count), fmt(v.total), fmt(v.open)] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [String(tc), fmt(tt), fmt(to2)] });
    return { cols: ['Stage', 'Invoices', 'Total', 'Open'], rows };
  }
  if (id === 'bill-funnel') {
    const { data, error } = await sb.from('acct_v_bill_funnel').select('stage, stage_order, bill_count, amount').eq('tenant_id', DEFAULT_TENANT_ID).order('stage_order', { ascending: true });
    if (error) throw new Error(error.message);
    rows.push({ kind: 'section', cells: ['Stage', 'Bills', 'Amount'] });
    let tc = 0;
    let ta = 0;
    for (const r of (data || []) as Record<string, unknown>[]) {
      tc += Number(r.bill_count || 0);
      ta += Number(r.amount || 0);
      rows.push({ kind: 'sub', cells: [String(r.stage), String(r.bill_count || 0), fmt(Number(r.amount || 0))] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [String(tc), fmt(ta)] });
    return { cols: ['Stage', 'Bills', 'Amount'], rows };
  }
  if (id === 'spend-by-category') {
    const { data, error } = await sb.from('acct_v_spend_by_category').select('month, code, name, amount').eq('tenant_id', DEFAULT_TENANT_ID).gte('month', from.slice(0, 7) + '-01').lte('month', to.slice(0, 7) + '-01').limit(5000);
    if (error) throw new Error(error.message);
    const byCat = new Map<string, number>();
    for (const r of (data || []) as Record<string, unknown>[]) {
      const key = `${r.code ? `${r.code} · ` : ''}${r.name || 'Category'}`;
      byCat.set(key, (byCat.get(key) || 0) + Number(r.amount || 0));
    }
    const grand = round2([...byCat.values()].reduce((a, b) => a + b, 0));
    rows.push({ kind: 'section', cells: ['Category', 'Amount', '% of spend'] });
    for (const [name, amount] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push({ kind: 'sub', cells: [name, fmt(amount), grand ? `${((amount / grand) * 100).toFixed(0)}%` : '—'] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(grand), '100%'] });
    return { cols: ['Category', 'Amount', '% of spend'], rows };
  }
  if (id === 'bank-feed-review') {
    const { data, error } = await sb.from('acct_v_bank_feed_review').select('transaction_date, bank_account_name, description, spent, received, review_status, category').eq('tenant_id', DEFAULT_TENANT_ID).order('transaction_date', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    rows.push({ kind: 'section', cells: ['Date', 'Account', 'Description', 'Spent', 'Received', 'Status', 'Category'] });
    for (const r of (data || []) as Record<string, unknown>[]) {
      rows.push({ kind: 'sub', cells: [fmtDate(String(r.transaction_date || '')), String(r.bank_account_name || ''), String(r.description || ''), r.spent == null ? '—' : fmt(Number(r.spent)), r.received == null ? '—' : fmt(Number(r.received)), String(r.review_status || ''), String(r.category || '—')] });
    }
    return { cols: ['Date', 'Account', 'Description', 'Spent', 'Received', 'Status', 'Category'], rows };
  }
  if (id === 'bank-feed-stages') {
    const { data, error } = await sb.from('acct_v_bank_feed_stages').select('bank_account, stage, items, money_in, money_out, oldest').eq('tenant_id', DEFAULT_TENANT_ID).order('bank_account', { ascending: true }).order('stage', { ascending: true });
    if (error) throw new Error(error.message);
    rows.push({ kind: 'section', cells: ['Account', 'Stage', 'Items', 'Money in', 'Money out', 'Oldest'] });
    let ti = 0;
    let tIn = 0;
    let tOut = 0;
    for (const r of (data || []) as Record<string, unknown>[]) {
      ti += Number(r.items || 0);
      tIn += Number(r.money_in || 0);
      tOut += Number(r.money_out || 0);
      rows.push({ kind: 'sub', cells: [String(r.bank_account || ''), String(r.stage || ''), String(r.items || 0), fmt(Number(r.money_in || 0)), fmt(Number(r.money_out || 0)), r.oldest ? fmtDate(String(r.oldest)) : '—'] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [String(ti), fmt(tIn), fmt(tOut), ''] });
    return { cols: ['Account', 'Stage', 'Items', 'Money in', 'Money out', 'Oldest'], rows };
  }
  if (id === 'tasks-due') {
    const { data, error } = await sb.from('acct_v_tasks_due').select('title, section, due_date, status, priority, overdue').eq('tenant_id', DEFAULT_TENANT_ID).order('due_date', { ascending: true });
    if (error) throw new Error(error.message);
    rows.push({ kind: 'section', cells: ['Task', 'Section', 'Due', 'Status', 'Priority', 'Overdue'] });
    for (const r of (data || []) as Record<string, unknown>[]) {
      rows.push({ kind: 'sub', cells: [String(r.title || ''), String(r.section || ''), r.due_date ? fmtDate(String(r.due_date)) : '—', String(r.status || ''), String(r.priority || ''), r.overdue ? 'Yes' : 'No'] });
    }
    return { cols: ['Task', 'Section', 'Due', 'Status', 'Priority', 'Overdue'], rows };
  }
  if (id === 'undeposited') {
    const { data, error } = await sb.from('acct_v_undeposited_payments').select('receipt_number, receipt_date, customer_id, amount, payment_method').eq('tenant_id', DEFAULT_TENANT_ID).order('receipt_date', { ascending: true });
    if (error) throw new Error(error.message);
    const list = (data || []) as Record<string, unknown>[];
    const custIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean) as string[])];
    const { data: custs } = custIds.length
      ? await sb.from('crm_customers').select('id, company_name, preferred_name, first_name, last_name, email').in('id', custIds)
      : { data: [] };
    const names = new Map(((custs || []) as Record<string, unknown>[]).map((c) => [String(c.id), String(c.company_name || [c.preferred_name || c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '')]));
    rows.push({ kind: 'section', cells: ['Receipt', 'Date', 'Customer', 'Amount', 'Method'] });
    let total = 0;
    for (const r of list) {
      total += Number(r.amount || 0);
      rows.push({ kind: 'sub', cells: [String(r.receipt_number || ''), fmtDate(String(r.receipt_date || '')), names.get(String(r.customer_id || '')) || 'Customer', fmt(Number(r.amount || 0)), String(r.payment_method || '')] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(total), ''] });
    return { cols: ['Receipt', 'Date', 'Customer', 'Amount', 'Method'], rows };
  }
  // account-list
  const { data, error } = await sb.from('acct_v_account_list').select('code, name, account_type, balance, last_activity').eq('tenant_id', DEFAULT_TENANT_ID).order('code', { ascending: true });
  if (error) throw new Error(error.message);
  rows.push({ kind: 'section', cells: ['Code', 'Account', 'Type', 'Balance', 'Last activity'] });
  for (const r of (data || []) as Record<string, unknown>[]) {
    rows.push({ kind: 'sub', cells: [String(r.code || ''), String(r.name || ''), String(r.account_type || ''), fmt(Number(r.balance || 0)), r.last_activity ? fmtDate(String(r.last_activity).slice(0, 10)) : '—'] });
  }
  return { cols: ['Code', 'Account', 'Type', 'Balance', 'Last activity'], rows };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!TITLES[id]) return err('NOT_FOUND', `Unknown report '${id}'`, 404);
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const defFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const from = sp.get('from') || defFrom;
  const to = sp.get('to') || defTo;
  const compare = sp.get('compare') === '1';
  const pct = sp.get('pct') === '1';
  const sb = supabaseAdmin();

  let built: { cols: string[]; rows: Row[] };
  let range = `${fmtLong(from)} – ${fmtLong(to)}`;

  if (id === 'salesbycustomer') {
    const { data: invoices } = await sb
      .from('acct_ar_invoices')
      .select('customer_id, customer_email, total, amount_paid, amount_credited, status, due_date, invoice_date')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(5000);
    const list = ((invoices || []) as Record<string, unknown>[]).filter(
      (i) => !String(i.status || '').toLowerCase().startsWith('void'),
    );
    const custIds = [...new Set(list.map((i) => i.customer_id).filter(Boolean) as string[])];
    const { data: parties } = custIds.length
      ? await sb.from('platform_parties').select('id, display_name').in('id', custIds)
      : { data: [] };
    const names = new Map(((parties || []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.display_name || '')]));
    const custName = (i: Record<string, unknown>) =>
      (i.customer_id ? names.get(String(i.customer_id)) : null) || (i.customer_email as string) || 'Customer';

    const byCust = new Map<string, number>();
    let grand = 0;
    for (const i of list) {
      if (String(i.invoice_date || '') < from || String(i.invoice_date || '') > to) continue;
      const t = Number(i.total || 0);
      grand += t;
      byCust.set(custName(i), (byCust.get(custName(i)) || 0) + t);
    }
    const rows: Row[] = [{ kind: 'section', cells: ['Customer', 'Revenue', '% of total'] }];
    for (const [name, total] of [...byCust.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push({ kind: 'sub', cells: [name, fmt(total), grand ? `${((total / grand) * 100).toFixed(0)}%` : '—'] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(grand), '100%'] });
    built = { cols: ['Customer', 'Revenue', '% of total'], rows };
  } else if (id === 'araging' || id === 'apaging') {
    /* Aging comes from the acct_v_* views, NOT a live invoice/bill scan:
       the views are POSTED-only (posted_journal_id NOT NULL, status not
       void/draft[/written_off], open_balance > 0), so a draft invoice
       correctly shows $0 here. The old builder counted the draft. */
    range = `As of ${fmtLong(to)}`;
    const view = id === 'araging' ? 'acct_v_ar_aging' : 'acct_v_ap_aging';
    const nameCol = id === 'araging' ? 'customer_name' : 'vendor_name';
    const who = id === 'araging' ? 'Customer' : 'Vendor';
    const { data, error } = await sb.from(view).select('*').eq('tenant_id', DEFAULT_TENANT_ID).order(nameCol, { ascending: true });
    if (error) return err('INTERNAL', error.message, 500);
    const rows: Row[] = [{ kind: 'section', cells: [who, 'Current', '1–30', '31–60', '61–90', '90+', 'Total'] }];
    const totals = [0, 0, 0, 0, 0];
    for (const r of (data || []) as Record<string, unknown>[]) {
      const arr = [Number(r.current_due || 0), Number(r.days_1_30 || 0), Number(r.days_31_60 || 0), Number(r.days_61_90 || 0), Number(r.days_over_90 || 0)];
      arr.forEach((v, i) => (totals[i] += v));
      rows.push({ kind: 'sub', cells: [String(r[nameCol] || who), ...arr.map(fmtOrDash), fmt(round2(arr.reduce((x, y) => x + y, 0)))] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [...totals.map(fmt), fmt(round2(totals.reduce((x, y) => x + y, 0)))] });
    built = { cols: [who, 'Current', '1–30', '31–60', '61–90', '90+', 'Total'], rows };
  } else if (
    id === 'monthly-pnl' ||
    id === 'sales-funnel' ||
    id === 'bill-funnel' ||
    id === 'spend-by-category' ||
    id === 'bank-feed-review' ||
    id === 'bank-feed-stages' ||
    id === 'tasks-due' ||
    id === 'undeposited' ||
    id === 'account-list'
  ) {
    /* Batch A — reports read straight off the acct_v_* views. */
    try {
      built = await buildViewReport(sb, id, from, to);
    } catch (e) {
      return err('INTERNAL', e instanceof Error ? e.message : 'View query failed', 500);
    }
    if (id === 'monthly-pnl' || id === 'sales-funnel' || id === 'bill-funnel' || id === 'spend-by-category') {
      range = `${fmtLong(from)} – ${fmtLong(to)}`;
    } else if (id === 'account-list') {
      range = `As of ${fmtLong(to)}`;
    } else {
      range = 'Current';
    }
  } else if (id === 'expensesbyvendor') {
    const { data: bills } = await sb
      .from('acct_ap_bills')
      .select('vendor_id, total, status, bill_date')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .gte('bill_date', from)
      .lte('bill_date', to)
      .limit(5000);
    const list = ((bills || []) as Record<string, unknown>[]).filter((b) => String(b.status || '') !== 'void');
    const vendorIds = [...new Set(list.map((b) => b.vendor_id).filter(Boolean) as string[])];
    const { data: vendors } = vendorIds.length
      ? await sb.from('acct_vendors').select('id, legal_name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', vendorIds)
      : { data: [] };
    const names = new Map(((vendors || []) as Record<string, unknown>[]).map((v) => [String(v.id), String(v.legal_name || '')]));
    const byVendor = new Map<string, { total: number; count: number }>();
    for (const b of list) {
      const key = names.get(String(b.vendor_id)) || 'Vendor';
      const cur = byVendor.get(key) || { total: 0, count: 0 };
      cur.total += Number(b.total || 0);
      cur.count += 1;
      byVendor.set(key, cur);
    }
    const rows: Row[] = [{ kind: 'section', cells: ['Vendor', 'Expenses', 'Bills'] }];
    let grand = 0;
    let count = 0;
    for (const [name, v] of [...byVendor.entries()].sort((a, b) => b[1].total - a[1].total)) {
      grand += v.total;
      count += v.count;
      rows.push({ kind: 'sub', cells: [name, fmt(v.total), String(v.count)] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(grand), String(count)] });
    built = { cols: ['Vendor', 'Expenses', 'Bills'], rows };
  } else if (id === 'salestax') {
    const [{ data: txns }, { data: filings }, { data: jurisdictions }] = await Promise.all([
      sb.from('acct_tax_transactions').select('jurisdiction_id, direction, tax_amount, tax_date').eq('tenant_id', DEFAULT_TENANT_ID).lte('tax_date', to).limit(10000),
      sb.from('acct_tax_filings').select('jurisdiction_id, tax_remitted, status').eq('tenant_id', DEFAULT_TENANT_ID).limit(5000),
      sb.from('acct_tax_jurisdictions').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const jNames = new Map(((jurisdictions || []) as Record<string, unknown>[]).map((j) => [String(j.id), String(j.name || '')]));
    const collected = new Map<string, number>();
    for (const t of (txns || []) as Record<string, unknown>[]) {
      if (String(t.direction) !== 'sale') continue;
      const k = String(t.jurisdiction_id || '');
      collected.set(k, (collected.get(k) || 0) + Number(t.tax_amount || 0));
    }
    const paid = new Map<string, number>();
    for (const f of (filings || []) as Record<string, unknown>[]) {
      if (String(f.status) !== 'paid') continue;
      const k = String(f.jurisdiction_id || '');
      paid.set(k, (paid.get(k) || 0) + Number(f.tax_remitted || 0));
    }
    const rows: Row[] = [{ kind: 'section', cells: ['Jurisdiction', 'Collected', 'Paid', 'Owed'] }];
    let tc = 0;
    let tp = 0;
    for (const k of new Set([...collected.keys(), ...paid.keys()])) {
      const c = round2(collected.get(k) || 0);
      const p = round2(paid.get(k) || 0);
      tc += c;
      tp += p;
      rows.push({ kind: 'sub', cells: [jNames.get(k) || 'Jurisdiction', fmt(c), fmt(p), fmt(round2(c - p))] });
    }
    rows.push({ kind: 'final', label: 'Total', cells: [fmt(tc), fmt(tp), fmt(round2(tc - tp))] });
    built = { cols: ['Jurisdiction', 'Collected', 'Paid', 'Owed'], rows };
  } else {
    const L = await loadLedger(sb);
    if (id === 'pnl') built = buildPnl(L, from, to, compare, pct);
    else if (id === 'bs') {
      built = buildBs(L, to);
      range = `As of ${fmtLong(to)}`;
    } else if (id === 'tb') {
      built = buildTb(L, to);
      range = `As of ${fmtLong(to)}`;
    } else if (id === 'gl') built = buildGl(L, from, to);
    else {
      const { data: bankAccts } = await sb.from('acct_bank_accounts').select('gl_account_id').eq('tenant_id', DEFAULT_TENANT_ID);
      const bankGlIds = new Set(((bankAccts || []) as Record<string, unknown>[]).map((b) => String(b.gl_account_id || '')));
      built = buildCashflow(L, bankGlIds, from, to);
    }
  }

  return NextResponse.json({ data: { id, title: TITLES[id], range, columns: built.cols, rows: built.rows } });
}
