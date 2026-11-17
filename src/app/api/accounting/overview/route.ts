import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Accounting overview aggregates — every number on the Overview
   screen computed from the live acct_* tables: bank feed review
   queue, uncategorized spend, bank balances (the GENERAL LEDGER via
   acct_account_balance — NOT opening + Σ feed, which reported -$5
   for an account whose books say $210+), last completed
   reconciliation, setup-checklist facts, the receipts inbox preview,
   the for-review feed, and recent activity (posted journals, receipts,
   bank transactions by recency). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const sb = supabaseAdmin();
  const [accountsRes, txnsRes, coaRes, rulesRes, taxRes, reconRes, inboxRes, journalRes, entityRes] = await Promise.all([
    sb.from('acct_bank_accounts').select('id, name, gl_account_id').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true }),
    sb.from('acct_bank_transactions').select('id, bank_account_id, amount, review_status, category_account_id, suggested_account_id, description, transaction_date, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('transaction_date', { ascending: false }).limit(10000),
    sb.from('acct_chart_of_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true),
    sb.from('acct_bank_rules').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true),
    sb.from('acct_tax_codes').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('acct_reconciliations').select('as_of_date, completed_at, status').eq('tenant_id', DEFAULT_TENANT_ID).order('as_of_date', { ascending: false }).limit(1),
    sb.from('acct_document_inbox').select('id, vendor_id, total, doc_date, created_at, status, matched_bank_transaction_id').eq('tenant_id', DEFAULT_TENANT_ID).eq('doc_kind', 'receipt').order('created_at', { ascending: false }).limit(50),
    sb.from('acct_journal_entries').select('id, entry_no, memo, reference, total_debit, posted_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'posted').is('reversal_of_id', null).order('created_at', { ascending: false }).limit(5),
    sb.from('acct_entities').select('name').eq('tenant_id', DEFAULT_TENANT_ID).limit(1),
  ]);
  if (accountsRes.error) return err('INTERNAL', accountsRes.error.message, 500);

  const accounts = (accountsRes.data || []) as Record<string, unknown>[];
  const txns = (txnsRes.data || []) as Record<string, unknown>[];
  const coaNames = new Map(((coaRes.data || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name || '')]));

  // ── KPI tiles (kpis-4) — P&L + close + trial balance, from the ledger ──
  // P&L comes from acct_profit_and_loss (posted + reversed entries via
  // acct__ledger_sums, signed by account_type — contra-revenue reduces
  // income the same way /api/reports signs by section; the proof script
  // ties these numbers to /api/reports every run). Do NOT use
  // rpc_get_profit_and_loss here: it counts posted-only entries and
  // misses the 339 reversed ones.
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const monthStart = `${ym}-01`;
  const todayStr = now.toISOString().slice(0, 10);
  const yearStart = `${ym.slice(0, 4)}-01-01`;
  const [pnlMtd, pnlYtd, tbRows, draftsRes, closesRes, chartRes] = await Promise.all([
    sb.rpc('acct_profit_and_loss', { p_tenant: DEFAULT_TENANT_ID, p_from: monthStart, p_to: todayStr, p_entity: null, p_compare_prior_year: false }),
    sb.rpc('acct_profit_and_loss', { p_tenant: DEFAULT_TENANT_ID, p_from: yearStart, p_to: todayStr, p_entity: null, p_compare_prior_year: false }),
    sb.rpc('acct_trial_balance', { p_tenant: DEFAULT_TENANT_ID, p_as_of: todayStr, p_entity: null }),
    sb.from('acct_journal_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).in('status', ['draft', 'approved']),
    sb.from('acct_closes').select('id, period_id, status').eq('tenant_id', DEFAULT_TENANT_ID).order('period_end', { ascending: false }).limit(1),
    sb.from('acct_chart_of_accounts').select('id, account_type').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  const typeById = new Map(((chartRes.data || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.account_type || '')]));
  const sumByType = (rows: unknown, type: string) =>
    round2(((rows as Record<string, unknown>[]) || []).filter((r) => typeById.get(String(r.account_id)) === type).reduce((s, r) => s + Number(r.amount || 0), 0));
  const revenueMtd = sumByType(pnlMtd.data, 'revenue');
  const expensesMtd = sumByType(pnlMtd.data, 'expense');
  const netIncomeYtd = round2(sumByType(pnlYtd.data, 'revenue') - sumByType(pnlYtd.data, 'expense'));
  const tbDebit = round2(((tbRows.data as Record<string, unknown>[]) || []).reduce((s, r) => s + Number(r.debit || 0), 0));
  const tbCredit = round2(((tbRows.data as Record<string, unknown>[]) || []).reduce((s, r) => s + Number(r.credit || 0), 0));
  let closeProgress: { done: number; total: number } | null = null;
  const latestClose = (closesRes.data?.[0] || null) as Record<string, unknown> | null;
  if (latestClose?.id) {
    const { count: done } = await sb.from('acct_close_tasks').select('id', { count: 'exact', head: true }).eq('close_id', String(latestClose.id)).in('status', ['done', 'skipped']);
    const { count: total } = await sb.from('acct_close_tasks').select('id', { count: 'exact', head: true }).eq('close_id', String(latestClose.id));
    closeProgress = { done: done || 0, total: total || 0 };
  }

  // Bank balance = Σ general-ledger balances of the bank accounts.
  // (Was: opening_balance + Σ feed amounts. Wrong — opening is NULL
  // and the feed is partial, so it reported -$5 for accounts whose
  // books say $210.35 + $152.)
  let bankBalance = 0;
  for (const a of accounts) {
    if (!a.gl_account_id) continue;
    const { data: bal } = await sb.rpc('acct_account_balance', { p_account_id: a.gl_account_id });
    bankBalance += Number(bal ?? 0);
  }
  bankBalance = round2(bankBalance);

  const reviewTxns = txns.filter((t) => t.review_status === 'for_review');
  const uncategorized = txns.filter((t) => t.review_status !== 'excluded' && !t.category_account_id);
  const lastRecon = (reconRes.data?.[0] || null) as Record<string, unknown> | null;

  const inbox = (inboxRes.data || []) as Record<string, unknown>[];
  const receiptIds = inbox.map((r) => String(r.id));
  const { data: exts } = receiptIds.length
    ? await sb.from('acct_receipt_extractions').select('inbox_id, vendor_name, extracted_total, receipt_date').eq('tenant_id', DEFAULT_TENANT_ID).in('inbox_id', receiptIds)
    : { data: [] };
  const extByInbox = new Map(((exts || []) as Record<string, unknown>[]).map((e) => [String(e.inbox_id), e]));
  const vendorIds = inbox.map((r) => r.vendor_id).filter(Boolean) as string[];
  const { data: vendors } = vendorIds.length
    ? await sb.from('acct_vendors').select('id, legal_name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', vendorIds)
    : { data: [] };
  const vendorNames = new Map(((vendors || []) as Record<string, unknown>[]).map((v) => [String(v.id), String(v.legal_name || '')]));
  const bankNames = new Map(accounts.map((a) => [String(a.id), String(a.name || '')]));
  const txnById = new Map(txns.map((t) => [String(t.id), t]));

  const receiptsPreview = inbox.slice(0, 3).map((r) => {
    const ext = extByInbox.get(String(r.id));
    const matchedTxn = r.matched_bank_transaction_id ? txnById.get(String(r.matched_bank_transaction_id)) : null;
    return {
      id: String(r.id),
      vendorName: (ext?.vendor_name as string) || (r.vendor_id ? vendorNames.get(String(r.vendor_id)) || null : null) || 'Receipt',
      date: (ext?.receipt_date as string) || (r.doc_date as string) || String(r.created_at || '').slice(0, 10),
      amount: ext?.extracted_total != null ? Number(ext.extracted_total) : r.total != null ? Number(r.total) : null,
      paymentAccountLabel: matchedTxn ? bankNames.get(String(matchedTxn.bank_account_id)) || null : null,
      isNew: String(r.status || '') !== 'processed',
    };
  });

  const activity: { id: string; kind: string; title: string; detail: string; at: string }[] = [];
  for (const j of (journalRes.data || []) as Record<string, unknown>[]) {
    activity.push({
      id: `je-${String(j.id)}`,
      kind: 'journal',
      title: (j.memo as string) || (j.reference as string) || `Journal ${String(j.entry_no || '')}`,
      detail: `Posted · $${Number(j.total_debit || 0).toFixed(2)}`,
      at: String(j.posted_at || j.created_at || ''),
    });
  }
  for (const r of inbox.slice(0, 5)) {
    const ext = extByInbox.get(String(r.id));
    activity.push({
      id: `rc-${String(r.id)}`,
      kind: 'receipt',
      title: `Receipt — ${(ext?.vendor_name as string) || 'intake'}`,
      detail: `Receipts inbox · ${String(r.status || '')}`,
      at: String(r.created_at || ''),
    });
  }
  for (const t of [...txns].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5)) {
    activity.push({
      id: `bt-${String(t.id)}`,
      kind: 'bank',
      title: String(t.description || 'Bank transaction'),
      detail: `${bankNames.get(String(t.bank_account_id)) || 'Bank'} · $${Number(t.amount || 0).toFixed(2)}`,
      at: String(t.created_at || ''),
    });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    data: {
      entityName: (entityRes.data?.[0] as { name?: string } | undefined)?.name || null,
      reviewCount: reviewTxns.length,
      reviewOldestDate: reviewTxns.length ? String(reviewTxns[reviewTxns.length - 1].transaction_date || '') : null,
      uncategorizedCount: uncategorized.length,
      uncategorizedTotal: round2(uncategorized.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0)),
      bankBalance,
      bankAccountCount: accounts.length,
      bankAccountNames: accounts.map((a) => String(a.name || '')),
      lastReconciledDate: lastRecon ? String(lastRecon.as_of_date || '') : null,
      lastReconciledStatus: lastRecon ? String(lastRecon.status || '') : null,
      coaCount: (coaRes.data || []).length,
      activeRuleCount: rulesRes.count || 0,
      taxCodeCount: taxRes.count || 0,
      receiptsForReview: inbox.filter((r) => String(r.status || '') !== 'processed').length,
      receiptsPreview,
      kpis: {
        // Bank balance IS the cash-position tile (sum of cash account
        // balances, from the GL) — the strip's "Bank balance" card shows it.
        cashPosition: bankBalance,
        revenueMtd,
        expensesMtd,
        netIncomeYtd,
        unpostedDrafts: draftsRes.count || 0,
        closeProgress,
        trialBalance: { debits: tbDebit, credits: tbCredit, balanced: Math.abs(tbDebit - tbCredit) < 0.01 },
      },
      reviewFeed: reviewTxns.slice(0, 5).map((t) => ({
        id: String(t.id),
        date: String(t.transaction_date || ''),
        description: String(t.description || ''),
        amount: Number(t.amount || 0),
        suggestedLabel: t.suggested_account_id ? coaNames.get(String(t.suggested_account_id)) || null : null,
        suggestedAccountId: (t.suggested_account_id as string) || null,
      })),
      activity: activity.slice(0, 5),
    },
  });
}
