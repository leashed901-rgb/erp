import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Every report on the Quick view screen, computed live from the general
 * ledger and the document tables. No hardcoded numbers anywhere:
 *   P&L / Balance sheet / Trial balance / General ledger / Cash flow
 *     ← acct_journal_entries + acct_journal_lines (posted|reversed)
 *       + acct_chart_of_accounts, signed by the account's SECTION
 *       (parent type — see `signed` below)
 *   A/R aging / Sales by customer ← acct_ar_invoices (+ parties names)
 *   Expenses by vendor ← acct_ap_bills + acct_spend_transactions
 *   Sales tax liability ← acct_tax_filings + acct_tax_jurisdictions
 *
 * Defaults to the current month when from/to are omitted.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = searchParams.get('from') || `${ym}-01`;
  const to = searchParams.get('to') || now.toISOString().slice(0, 10);
  const yearStart = `${to.slice(0, 4)}-01-01`;
  if (from > to) return err('VALIDATION', 'from must be on or before to.');

  const sb = supabaseAdmin();

  // ── Chart + journal (the whole posted book up to `to`) ──
  // PostgREST caps every page at 1,000 rows server-side (verified live:
  // limit=10000 returned Content-Range 0-999/1250), so the entries and
  // lines fetches page in 1,000-row ranges until a short page arrives.
  // A single .limit() silently drops the newest rows once the book
  // passes 1,000 lines — which is exactly how the P&L lost the
  // physical-count journals (5100 showed -720 instead of -14,400).
  // Pages are ordered by id so the order is total and stable.
  const PAGE = 1000;
  async function fetchAll<T>(build: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }> }): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await build().range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message || 'fetch failed');
      const page = (data ?? []) as T[];
      out.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    return out;
  }
  const [accounts, entries, lines] = await Promise.all([
    sb.from('acct_chart_of_accounts').select('id, code, name, account_type, subtype, normal_balance').eq('tenant_id', DEFAULT_TENANT_ID).then((r) => {
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    }),
    fetchAll<{ id: string; entry_date: string; memo: string | null; status: string }>(() =>
      sb.from('acct_journal_entries').select('id, entry_date, memo, status').eq('tenant_id', DEFAULT_TENANT_ID).in('status', ['posted', 'reversed']).lte('entry_date', to).order('id')),
    fetchAll<{ journal_entry_id: string; account_id: string; debit: number; credit: number; description: string | null }>(() =>
      sb.from('acct_journal_lines').select('journal_entry_id, account_id, debit, credit, description').eq('tenant_id', DEFAULT_TENANT_ID).order('id')),
  ]);

  const acctById = new Map((accounts || []).map(a => [a.id, a]));
  const entryById = new Map((entries || []).map(e => [e.id, e]));
  // Lines whose entry is posted/reversed and dated on or before `to`.
  const liveLines = (lines || []).filter(l => entryById.has(l.journal_entry_id));
  const inRange = (d: string) => d >= from && d <= to;
  const inYtd = (d: string) => d >= yearStart && d <= to;

  // Signed amount: credit-normal sections (revenue, liability, equity)
  // are credit-positive; debit-normal sections (asset, expense) are
  // debit-positive. Signed by the account's SECTION (parent type), NOT
  // by its own normal_balance — contra accounts carry the opposite
  // normal balance and must REDUCE their section total. Signing by
  // normal_balance added Sales Returns (4800) and Discounts Given
  // (4850) to income instead of subtracting them: P&L income read
  // $3,607.37 against the tax route's $3,522.63 (diff $84.74 =
  // 2 × ($36.87 + $5.50)), and the balance sheet was off by the same
  // $84.74 (verified live 2026-11-15). contra_asset/contra_liability/
  // contra_equity inherit their parent section's sign, so accumulated
  // depreciation and owner's draw reduce their sections too (both are
  // zero-balance today; the old code would have added them as well).
  const CREDIT_SECTIONS = new Set(['revenue', 'liability', 'equity', 'contra_liability', 'contra_equity']);
  const signed = (accountId: string, debit: number, credit: number) => {
    const a = acctById.get(accountId);
    return CREDIT_SECTIONS.has(String(a?.account_type || '')) ? credit - debit : debit - credit;
  };
  const entryDate = (line: { journal_entry_id: string }) => String(entryById.get(line.journal_entry_id)?.entry_date || '');

  // Per-account period + YTD activity and as-of balance.
  interface Agg { period: number; ytd: number; balance: number }
  const agg = new Map<string, Agg>();
  for (const l of liveLines) {
    const d = entryDate(l);
    const s = signed(l.account_id, Number(l.debit || 0), Number(l.credit || 0));
    const cur = agg.get(l.account_id) || { period: 0, ytd: 0, balance: 0 };
    cur.balance += s;
    if (inRange(d)) cur.period += s;
    if (inYtd(d)) cur.ytd += s;
    agg.set(l.account_id, cur);
  }
  const section = (type: string, subtype?: string) =>
    (accounts || [])
      .filter(a => a.account_type === type && (!subtype || a.subtype === subtype))
      .map(a => ({ account: `${a.code} · ${a.name}`, ...{ period: agg.get(a.id)?.period || 0, ytd: agg.get(a.id)?.ytd || 0, balance: agg.get(a.id)?.balance || 0 } }))
      .filter(r => r.period !== 0 || r.ytd !== 0 || r.balance !== 0)
      .sort((a, b) => a.account.localeCompare(b.account));
  const sum = (rows: { period: number; ytd: number; balance: number }[], k: 'period' | 'ytd' | 'balance') =>
    round2(rows.reduce((s, r) => s + r[k], 0));

  // ── P&L ──
  const income = section('revenue');
  const cogs = section('expense', 'cogs');
  const operating = section('expense').filter(r => !cogs.some(c => c.account === r.account));
  const incomeTotal = sum(income, 'period');
  const incomeTotalYtd = sum(income, 'ytd');
  const cogsTotal = sum(cogs, 'period');
  const cogsTotalYtd = sum(cogs, 'ytd');
  const operatingTotal = sum(operating, 'period');
  const operatingTotalYtd = sum(operating, 'ytd');
  const grossProfit = round2(incomeTotal - cogsTotal);
  const grossProfitYtd = round2(incomeTotalYtd - cogsTotalYtd);
  const netOperating = round2(grossProfit - operatingTotal);
  const netOperatingYtd = round2(grossProfitYtd - operatingTotalYtd);

  // ── Balance sheet (as of `to`) — contra accounts ride with their parent
  // section (credit-normal, so their signed balance reduces the total) ──
  const assets = [...section('asset'), ...section('contra_asset')];
  const liabilities = [...section('liability'), ...section('contra_liability')];
  const equity = [...section('equity'), ...section('contra_equity')];
  const assetsTotal = sum(assets, 'balance');
  const liabilitiesTotal = sum(liabilities, 'balance');
  // The period's net income is not yet closed into equity, so it rides as
  // its own equity line — otherwise assets ≠ liabilities + equity.
  const equityRows = netOperating !== 0
    ? [...equity, { account: 'Net income — current period', period: 0, ytd: netOperating, balance: netOperating }]
    : equity;
  const equityTotal = round2(sum(equity, 'balance') + netOperating);

  // ── Trial balance (as of `to`) ──
  // `bal` is section-signed (credit-normal sections positive on credit
  // balances). Convert back to debit/credit columns by the same section
  // sign — NOT by normal_balance, which flips contra accounts into the
  // wrong column (Sales Returns would show as a credit).
  const trialBalance = (accounts || [])
    .map(a => {
      const bal = agg.get(a.id)?.balance || 0;
      const net = CREDIT_SECTIONS.has(String(a.account_type || '')) ? -bal : bal;
      return {
        account: `${a.code} · ${a.name}`,
        debit: net > 0 ? round2(net) : 0,
        credit: net < 0 ? round2(-net) : 0,
      };
    })
    .filter(r => r.debit !== 0 || r.credit !== 0)
    .sort((a, b) => a.account.localeCompare(b.account));
  const tbDebit = round2(trialBalance.reduce((s, r) => s + r.debit, 0));
  const tbCredit = round2(trialBalance.reduce((s, r) => s + r.credit, 0));

  // ── General ledger: totals cover ALL lines in range; rows show the
  // latest 200 ──
  const glAll = liveLines.filter(l => inRange(entryDate(l)));
  const gl = glAll
    .sort((a, b) => entryDate(b).localeCompare(entryDate(a)))
    .slice(0, 200)
    .map(l => ({
      date: entryDate(l),
      description: String(l.description || entryById.get(l.journal_entry_id)?.memo || '—'),
      account: acctById.get(l.account_id)?.name || '—',
      debit: round2(Number(l.debit || 0)),
      credit: round2(Number(l.credit || 0)),
    }));
  const glDebit = round2(glAll.reduce((s, l) => s + Number(l.debit || 0), 0));
  const glCredit = round2(glAll.reduce((s, l) => s + Number(l.credit || 0), 0));

  // ── Cash flow (from journal movements in range) ──
  const movement = (match: (a: { name: string; account_type: string; subtype: string | null }) => boolean) => {
    let total = 0;
    for (const l of liveLines) {
      const d = entryDate(l);
      if (!inRange(d)) continue;
      const a = acctById.get(l.account_id);
      if (!a || !match(a)) continue;
      // Cash effect: asset debits spend cash, liability/equity credits bring it in.
      total += a.account_type === 'asset' ? -(Number(l.debit || 0) - Number(l.credit || 0)) : (Number(l.credit || 0) - Number(l.debit || 0));
    }
    return round2(total);
  };
  const arDelta = movement(a => a.subtype === 'accounts_receivable');
  const apDelta = movement(a => a.subtype === 'accounts_payable');
  const investing = movement(a => a.subtype === 'fixed_asset');
  const financing = movement(a => a.account_type === 'equity');
  const operatingCf = round2(netOperating + arDelta + apDelta);
  const netChange = round2(operatingCf + investing + financing);

  // ── Parties names live in metadata->name (display_name is NULL) ──
  const { data: parties } = await sb.from('platform_parties').select('id, metadata').eq('tenant_id', DEFAULT_TENANT_ID);
  const partyName = (id: string) => (parties || []).find(p => p.id === id)?.metadata?.name || '—';

  // ── A/R aging (open invoices by due date) ──
  const { data: invoices } = await sb.from('acct_ar_invoices').select('id, customer_id, invoice_number, invoice_date, due_date, total, open_balance').eq('tenant_id', DEFAULT_TENANT_ID);
  const today = now.toISOString().slice(0, 10);
  const daysAgo = (iso: string) => Math.floor((new Date(today).getTime() - new Date(iso).getTime()) / 86400000);
  const agingMap = new Map<string, { current: number; d30: number; d60: number; d90: number; total: number }>();
  for (const inv of invoices || []) {
    const bal = Number(inv.open_balance || 0);
    if (bal <= 0) continue;
    const name = partyName(String(inv.customer_id || ''));
    const cur = agingMap.get(name) || { current: 0, d30: 0, d60: 0, d90: 0, total: 0 };
    const age = daysAgo(String(inv.due_date || today));
    if (age <= 0) cur.current += bal;
    else if (age <= 30) cur.d30 += bal;
    else if (age <= 60) cur.d60 += bal;
    else cur.d90 += bal;
    cur.total += bal;
    agingMap.set(name, cur);
  }
  const arAging = [...agingMap.entries()]
    .map(([customer, v]) => ({ customer, current: round2(v.current), d30: round2(v.d30), d60: round2(v.d60), d90: round2(v.d90), total: round2(v.total) }))
    .sort((a, b) => b.total - a.total);

  // ── Sales by customer (invoices issued in range) ──
  const salesMap = new Map<string, number>();
  for (const inv of invoices || []) {
    if (!inRange(String(inv.invoice_date || ''))) continue;
    const name = partyName(String(inv.customer_id || ''));
    salesMap.set(name, (salesMap.get(name) || 0) + Number(inv.total || 0));
  }
  const salesTotal = round2([...salesMap.values()].reduce((s, n) => s + n, 0));
  const salesByCustomer = [...salesMap.entries()]
    .map(([customer, revenue]) => ({ customer, revenue: round2(revenue), pct: salesTotal > 0 ? round2((revenue / salesTotal) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Expenses by vendor (bills + spend in range) ──
  const [{ data: bills }, { data: spends }] = await Promise.all([
    sb.from('acct_ap_bills').select('vendor_id, bill_date, total').eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('acct_spend_transactions').select('payee_vendor_id, payee_name, payment_date, total, status').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  const expMap = new Map<string, { expenses: number; bills: number }>();
  for (const b of bills || []) {
    if (!inRange(String(b.bill_date || ''))) continue;
    const name = partyName(String(b.vendor_id || ''));
    const cur = expMap.get(name) || { expenses: 0, bills: 0 };
    cur.expenses += Number(b.total || 0);
    cur.bills += 1;
    expMap.set(name, cur);
  }
  for (const s of spends || []) {
    if (String(s.status || '') === 'void' || !inRange(String(s.payment_date || ''))) continue;
    const name = s.payee_vendor_id ? partyName(String(s.payee_vendor_id)) : String(s.payee_name || '—');
    const cur = expMap.get(name) || { expenses: 0, bills: 0 };
    cur.expenses += Number(s.total || 0);
    expMap.set(name, cur);
  }
  const expensesByVendor = [...expMap.entries()]
    .map(([vendor, v]) => ({ vendor, expenses: round2(v.expenses), bills: v.bills }))
    .sort((a, b) => b.expenses - a.expenses);

  // ── Sales tax liability (filings overlapping the range) ──
  const [{ data: filings }, { data: jurisdictions }] = await Promise.all([
    sb.from('acct_tax_filings').select('jurisdiction_id, period_start, period_end, tax_collected, tax_remitted').eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('acct_tax_jurisdictions').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  const taxMap = new Map<string, { collected: number; paid: number }>();
  for (const f of filings || []) {
    if (String(f.period_end || '') < from || String(f.period_start || '') > to) continue;
    const name = (jurisdictions || []).find(j => j.id === f.jurisdiction_id)?.name || '—';
    const cur = taxMap.get(name) || { collected: 0, paid: 0 };
    cur.collected += Number(f.tax_collected || 0);
    cur.paid += Number(f.tax_remitted || 0);
    taxMap.set(name, cur);
  }
  const salesTax = [...taxMap.entries()].map(([jurisdiction, v]) => ({
    jurisdiction,
    collected: round2(v.collected),
    paid: round2(v.paid),
    owed: round2(v.collected - v.paid),
  }));

  return NextResponse.json({
    data: {
      from, to,
      pnl: {
        income: income.map(r => ({ account: r.account, period: round2(r.period), ytd: round2(r.ytd) })),
        incomeTotal, incomeTotalYtd,
        cogs: cogs.map(r => ({ account: r.account, period: round2(r.period), ytd: round2(r.ytd) })),
        cogsTotal, cogsTotalYtd,
        operating: operating.map(r => ({ account: r.account, period: round2(r.period), ytd: round2(r.ytd) })),
        operatingTotal, operatingTotalYtd,
        grossProfit, grossProfitYtd, netOperating, netOperatingYtd,
      },
      balanceSheet: {
        assets: assets.map(r => ({ account: r.account, balance: round2(r.balance) })),
        assetsTotal,
        liabilities: liabilities.map(r => ({ account: r.account, balance: round2(r.balance) })),
        liabilitiesTotal,
        equity: equityRows.map(r => ({ account: r.account, balance: round2(r.balance) })),
        equityTotal,
      },
      trialBalance: { rows: trialBalance, debitTotal: tbDebit, creditTotal: tbCredit },
      gl: { rows: gl, debitTotal: glDebit, creditTotal: glCredit, count: gl.length, total: glAll.length },
      cashFlow: {
        operating: [
          { label: 'Net income', amount: netOperating },
          { label: 'Change in accounts receivable', amount: arDelta },
          { label: 'Change in accounts payable', amount: apDelta },
        ],
        operatingTotal: operatingCf,
        investing: [{ label: 'Purchase of fixed assets', amount: investing }],
        investingTotal: investing,
        financing: [{ label: 'Owner contributions / equity', amount: financing }],
        financingTotal: financing,
        netChange,
      },
      arAging,
      salesByCustomer: { rows: salesByCustomer, total: salesTotal },
      expensesByVendor,
      salesTax,
    },
    meta: { from, to, journalLines: liveLines.length },
  });
}
