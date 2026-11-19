import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** Screen type ('Income') → DB account_type ('revenue'). D-2: the DB
 *  CHECK constraint only allows asset/liability/equity/revenue/expense/
 *  contra-asset, contra-liability, contra-equity, statistical — 'income' is not a value. */
const TYPE_MAP: Record<string, string> = {
  Asset: 'asset',
  Liability: 'liability',
  Equity: 'equity',
  Income: 'revenue',
  Revenue: 'revenue',
  Expense: 'expense',
  asset: 'asset',
  liability: 'liability',
  equity: 'equity',
  income: 'revenue',
  revenue: 'revenue',
  expense: 'expense',
  contra_asset: 'contra_asset',
  contra_liability: 'contra_liability',
  contra_equity: 'contra_equity',
  statistical: 'statistical',
};

/** Detail-type label (from the drawer) → DB subtype slug. Unknown labels
 *  pass through slugified — subtype is free text in the DB. */
const DETAIL_MAP: Record<string, string> = {
  'Cash and cash equivalents': 'cash',
  Checking: 'bank',
  Savings: 'bank',
  'Accounts receivable': 'accounts_receivable',
  Inventory: 'inventory',
  'Fixed assets': 'fixed_asset',
  'Other current assets': 'other_current_asset',
  'Accounts payable': 'accounts_payable',
  'Credit card': 'credit_card',
  'Sales tax payable': 'other_current_liability',
  'Payroll liabilities': 'other_current_liability',
  Loan: 'loan',
  'Other current liabilities': 'other_current_liability',
  "Owner's equity": 'equity',
  'Retained earnings': 'equity',
  'Partner contributions': 'equity',
  'Partner distributions': 'equity',
  'Sales of product income': 'income',
  'Sales of services': 'income',
  Discounts: 'income',
  'Shipping income': 'income',
  'Interest income': 'other_income',
  'Cost of goods sold': 'cogs',
  Advertising: 'expense',
  'Bank charges & fees': 'expense',
  'Dues and subscriptions': 'expense',
  Insurance: 'expense',
  'Legal & professional': 'expense',
  'Meals & entertainment': 'expense',
  'Office/General Administrative': 'expense',
  'Rent or lease': 'expense',
  'Shipping & delivery': 'expense',
  Software: 'expense',
  Travel: 'expense',
  Utilities: 'expense',
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function mapAccountType(t: string): string {
  return TYPE_MAP[t] || TYPE_MAP[t?.toLowerCase()] || 'expense';
}

export function mapSubtype(detail: string | undefined, type: string): string {
  if (!detail) return type === 'revenue' ? 'income' : type === 'expense' ? 'expense' : 'other_current_asset';
  return DETAIL_MAP[detail] || slugify(detail);
}

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/accounts — the live chart of accounts, ordered by code.
 *  Balance is derived from posted/reversed journal lines, signed by
 *  normal_balance — the same convention as acct_account_balance. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toLowerCase();
  const type = searchParams.get('type');

  let query = supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id, code, name, account_type, subtype, description, currency, parent_account_id, is_control_account, is_reconcilable, is_posting_allowed, is_system, is_active, normal_balance, created_at, tax_category_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code', { ascending: true });
  if (type) query = query.eq('account_type', mapAccountType(type));

  const { data: accounts, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);

  // One aggregated balance query for all accounts (posted/reversed lines).
  const { data: lines } = await supabaseAdmin()
    .from('acct_journal_lines')
    .select('account_id, debit, credit, acct_journal_entries!inner(status)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('acct_journal_entries.status', ['posted', 'reversed']);
  const netByAccount = new Map<string, number>();
  for (const l of lines || []) {
    const net = Number(l.debit || 0) - Number(l.credit || 0);
    netByAccount.set(l.account_id, (netByAccount.get(l.account_id) || 0) + net);
  }

  let rows = (accounts || []).map((a) => {
    const net = netByAccount.get(a.id) || 0;
    const balance = a.normal_balance === 'debit' ? net : -net;
    return { ...a, balance, detail_type: a.subtype };
  });
  if (q) {
    rows = rows.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.code.includes(q) ||
      (a.description || '').toLowerCase().includes(q) ||
      (a.subtype || '').toLowerCase().includes(q),
    );
  }
  return NextResponse.json({ data: rows, meta: { total: rows.length } });
}

/** POST /api/accounts — create an account (create.account). The
 *  acct_coa_before_write trigger defaults normal_balance and the
 *  cash-flow category; the (tenant_id, code) unique index rejects
 *  duplicate codes. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const code = String(body.code || body.number || '').trim();
  const name = String(body.name || '').trim();
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  const accountType = mapAccountType(String(body.account_type || body.type || 'expense'));
  const subtype = mapSubtype(
    (body.subtype || body.detailType || body.detail) as string | undefined,
    accountType,
  );
  // entity_id is NOT NULL with no default — resolve the tenant's default
  // entity the same way the invoice trigger does.
  let entityId = body.entity_id as string | undefined;
  if (!entityId) {
    const { data: defEntity } = await supabaseAdmin().rpc('acct_default_entity', {
      p_tenant_id: DEFAULT_TENANT_ID,
    });
    entityId = defEntity as string | undefined;
  }
  if (!entityId) return err('CONFIG', 'No default entity for this tenant', 500);

  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      parent_account_id: (body.parent_account_id as string) || (body.parent as string) || null,
      code,
      name,
      account_type: accountType,
      subtype,
      description: (body.description as string) || null,
      currency: (body.currency as string) || 'USD',
      is_control_account: !!body.is_control_account,
      is_reconcilable: !!body.is_reconcilable,
      is_posting_allowed: body.is_posting_allowed !== false,
      is_active: body.is_active !== false,
    })
    .select('id, code, name, account_type, subtype, description, currency, parent_account_id, is_control_account, is_reconcilable, is_posting_allowed, is_system, is_active, normal_balance, tax_category_id')
    .single();
  if (error) {
    const msg = /duplicate key|unique/i.test(error.message)
      ? `An account with code ${code} already exists`
      : error.message;
    return err('VALIDATION', msg, 400);
  }
  return NextResponse.json({ data: { ...data, balance: 0, detail_type: data.subtype } }, { status: 201 });
}
