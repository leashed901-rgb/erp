import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/accounts?type=asset&active=true&q=...
 *  Reads acct_chart_of_accounts — the real CoA table. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const active = searchParams.get('active');
  const q = searchParams.get('q');

  let query = supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code', { ascending: true });

  if (type && type !== 'all') {
    // Map UI type → DB account_type. The DB uses lowercase: asset, liability, equity, revenue, expense.
    const typeMap: Record<string, string> = {
      Asset: 'asset', Assets: 'asset',
      Liability: 'liability', Liabilities: 'liability',
      Equity: 'equity',
      Revenue: 'revenue', Income: 'revenue',
      Expense: 'expense', Expenses: 'expense',
    };
    const dbType = typeMap[type] || type.toLowerCase();
    query = query.eq('account_type', dbType);
  }
  if (active === 'true') query = query.eq('is_active', true);
  if (q) {
    query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/accounts — create a single account.
 *  Body: { code, name, account_type, normal_balance?, subtype?, description?, currency?, is_reconcilable?, is_posting_allowed?, is_active? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.code || !body.name || !body.account_type) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'code, name, account_type are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Determine normal_balance from account_type if not specified.
  // Assets + Expenses → debit; Liabilities + Equity + Revenue → credit.
  const type = String(body.account_type).toLowerCase();
  const normalBalance = (body.normal_balance as string | undefined) ||
    (['asset', 'expense'].includes(type) ? 'debit' : 'credit');

  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    code: String(body.code),
    name: String(body.name),
    account_type: type,
    normal_balance: normalBalance,
    is_active: body.is_active !== false,
    is_posting_allowed: body.is_posting_allowed !== false,
  };
  if (body.subtype) insert.subtype = String(body.subtype);
  if (body.description) insert.description = String(body.description);
  if (body.currency) insert.currency = String(body.currency);
  if (body.is_reconcilable) insert.is_reconcilable = true;
  if (body.is_control_account) insert.is_control_account = true;
  if (body.is_system) insert.is_system = true;
  if (body.detail_type) insert.detail_type = String(body.detail_type);
  if (body.sort_order != null) insert.sort_order = Number(body.sort_order);

  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
