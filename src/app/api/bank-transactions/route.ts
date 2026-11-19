import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { BankTransaction } from '@/lib/accountingTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** Screen status from the DB row: the tabs are review / categorized /
 *  excluded. A row is categorized once it is in the books (posted or
 *  matched); excluded is its own state. */
export function uiStatus(r: { review_status: string; excluded_reason?: string | null }): 'review' | 'categorized' | 'excluded' {
  if (r.review_status === 'excluded' || r.excluded_reason) return 'excluded';
  if (['posted', 'matched', 'categorized'].includes(r.review_status)) return 'categorized';
  return 'review';
}

export function shapeRow(r: Record<string, unknown>, categoryName?: string | null): BankTransaction {
  const row = r as unknown as BankTransaction;
  return {
    ...row,
    ui_status: uiStatus(r as { review_status: string; excluded_reason?: string | null }),
    category_name: categoryName || null,
  };
}

/** GET /api/bank-transactions — the For review queue. Filters:
 *  ?bank_account_id= ?status=review|categorized|excluded ?q= ?from= ?to= */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bankAccountId = searchParams.get('bank_account_id');
  const status = searchParams.get('status');
  const q = searchParams.get('q')?.trim().toLowerCase();
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (bankAccountId) query = query.eq('bank_account_id', bankAccountId);
  if (from) query = query.gte('transaction_date', from);
  if (to) query = query.lte('transaction_date', to);

  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  let rows = (data || []).map((r) => shapeRow(r));
  if (status && status !== 'all') rows = rows.filter((r) => r.ui_status === status);
  if (q) {
    rows = rows.filter((r) =>
      (r.description || '').toLowerCase().includes(q) ||
      (r.payee || '').toLowerCase().includes(q) ||
      String(r.amount).includes(q) ||
      (r.category_name || '').toLowerCase().includes(q),
    );
  }
  // Category names for the list (one lookup, not N).
  const catIds = [...new Set(rows.map((r) => r.category_account_id).filter(Boolean) as string[])];
  if (catIds.length) {
    const { data: cats } = await supabaseAdmin()
      .from('acct_chart_of_accounts')
      .select('id, code, name')
      .in('id', catIds);
    const byId = new Map((cats || []).map((c) => [c.id, c]));
    rows = rows.map((r) => ({
      ...r,
      category_name: r.category_account_id ? byId.get(r.category_account_id as string)?.name || null : null,
      category_code: r.category_account_id ? byId.get(r.category_account_id as string)?.code || null : null,
    }));
  }
  const counts = {
    review: rows.filter((r) => r.ui_status === 'review').length,
    categorized: rows.filter((r) => r.ui_status === 'categorized').length,
    excluded: rows.filter((r) => r.ui_status === 'excluded').length,
  };
  return NextResponse.json({ data: rows, meta: { total: rows.length, counts } });
}

/** POST /api/bank-transactions — manual entry (a transaction typed in
 *  by hand, e.g. a cash expense). It lands in the For review queue
 *  like a feed row; categorizing it posts it to the books. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const bankAccountId = body.bank_account_id as string | undefined;
  const amount = Number(body.amount);
  const date = String(body.transaction_date || body.date || new Date().toISOString().slice(0, 10));
  if (!bankAccountId) return err('VALIDATION', 'bank_account_id is required', 400);
  if (!amount || amount === 0) return err('VALIDATION', 'amount must be non-zero (negative = money out)', 400);
  const { data: account } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('id, entity_id')
    .eq('id', bankAccountId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!account) return err('NOT_FOUND', 'Bank account not found', 404);

  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: account.entity_id,
      bank_account_id: bankAccountId,
      transaction_date: date,
      posted_date: date,
      amount,
      currency: (body.currency as string) || 'USD',
      description: (body.description as string) || (body.payee as string) || 'Manual transaction',
      payee: (body.payee as string) || null,
      reference: (body.reference as string) || null,
      memo: (body.memo as string) || null,
      review_status: 'for_review',
      match_status: 'unmatched',
    })
    .select('id, bank_account_id, transaction_date, amount, currency, description, payee, review_status, match_status')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: shapeRow(data as Record<string, unknown>) }, { status: 201 });
}
