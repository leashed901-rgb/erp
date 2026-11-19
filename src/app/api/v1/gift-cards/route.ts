import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Gift cards (pack 3) — the sanctioned write path is the accounting
 * RPC pair: acct_issue_gift_card posts the liability when a card is
 * issued, acct_redeem_gift_card moves liability against a posted
 * invoice. The ledger of cards is acct_gift_cards; this API reads and
 * writes only through those paths (no raw balance edits).
 *
 * GET /api/v1/gift-cards — list cards (page shape for the Gift cards
 * screen: code / kind / status / initial / balance / customer / expires).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  let query = supabaseAdmin()
    .from('acct_gift_cards')
    .select('id, code, kind, status, initial_amount, balance, currency, customer_id, issued_to_email, issued_reason, expires_at, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (q) query = query.ilike('code', '%' + q + '%');
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const cards = (data || []).map(c => ({
    id: c.id,
    code: c.code,
    kind: c.kind,
    status: Number(c.balance) <= 0 && c.status === 'active' ? 'redeemed' : c.status,
    initial: c.initial_amount,
    balance: c.balance,
    currency: c.currency,
    customer: c.issued_to_email || c.customer_id || '—',
    issuedReason: c.issued_reason,
    expires: c.expires_at,
    issuedAt: c.created_at,
  }));
  return NextResponse.json({ data: cards });
}

/**
 * POST /api/v1/gift-cards — issue a card via acct_issue_gift_card.
 * A card is either sold (sold_on_invoice_id) or promotional
 * (promotional_expense_account_id). The page issues promotional cards;
 * when no expense account is given, the tenant's Advertising and
 * Marketing expense account is used. Body: { amount, email?, code?,
 * expense_account_id?, sold_on_invoice_id?, customer_id? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return err('VALIDATION', 'amount must be positive', 400);
  const db = supabaseAdmin();

  let expenseAccountId = body.expense_account_id ? String(body.expense_account_id) : null;
  const soldOnInvoiceId = body.sold_on_invoice_id ? String(body.sold_on_invoice_id) : null;
  if (!soldOnInvoiceId && !expenseAccountId) {
    const { data: accounts } = await db
      .from('acct_chart_of_accounts')
      .select('id, name')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('account_type', 'expense')
      .eq('is_active', true)
      .order('name', { ascending: true });
    const pick =
      (accounts || []).find(a => /promot/i.test(a.name)) ||
      (accounts || []).find(a => /market/i.test(a.name)) ||
      (accounts || [])[0];
    expenseAccountId = pick?.id || null;
    if (!expenseAccountId) return err('VALIDATION', 'No expense account available for a promotional issue', 400);
  }

  const { data: cardId, error } = await db.rpc('acct_issue_gift_card', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_amount: amount,
    p_code: body.code ? String(body.code).toUpperCase() : null,
    p_customer_id: body.customer_id ? String(body.customer_id) : null,
    p_promotional_expense_account_id: soldOnInvoiceId ? null : expenseAccountId,
    p_sold_on_invoice_id: soldOnInvoiceId,
    p_email: body.email ? String(body.email) : null,
    p_date: new Date().toISOString().slice(0, 10),
  });
  if (error) return err('RPC', error.message, 422);

  const { data: card } = await db
    .from('acct_gift_cards')
    .select('id, code, kind, status, initial_amount, balance, currency, issued_to_email, expires_at, created_at')
    .eq('id', cardId as string)
    .single();
  return NextResponse.json({ data: card }, { status: 201 });
}
