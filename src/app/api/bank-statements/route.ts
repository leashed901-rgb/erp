import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { BankStatement } from '@/lib/bankDetailTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toStatement = (r: Record<string, unknown>, accountName = ''): BankStatement => ({
  id: String(r.id),
  bankAccountId: String(r.bank_account_id || ''),
  bankAccountName: accountName,
  statementStart: String(r.statement_start || ''),
  statementEnd: String(r.statement_end || ''),
  openingBalance: Number(r.opening_balance || 0),
  closingBalance: Number(r.closing_balance || 0),
  importedAt: (r.imported_at as string) || null,
  providerStatementId: (r.provider_statement_id as string) || null,
});

/** GET /api/bank-statements — recorded bank statements with account names. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_bank_statements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('statement_end', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data || [];
  const accountIds = [...new Set(rows.map((r) => r.bank_account_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (accountIds.length) {
    const { data: accts } = await sb.from('acct_bank_accounts').select('id,name').in('id', accountIds);
    (accts || []).forEach((a) => names.set(a.id, a.name));
  }
  return NextResponse.json({ data: rows.map((r) => toStatement(r, names.get(r.bank_account_id) || '')) });
}

/**
 * POST /api/bank-statements — record a bank statement by hand. There is
 * no statement-import RPC in the engine, so a statement is recorded from
 * the bank's own figures: account, period, opening and closing balance.
 * Body: { bankAccountId, statementStart, statementEnd, openingBalance, closingBalance }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.bankAccountId) return err('VALIDATION', 'bankAccountId is required', 400);
  if (!body.statementStart || !body.statementEnd) return err('VALIDATION', 'statementStart and statementEnd are required', 400);
  if (body.openingBalance == null || body.closingBalance == null) {
    return err('VALIDATION', 'openingBalance and closingBalance are required', 400);
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_bank_statements').insert({
    tenant_id: DEFAULT_TENANT_ID,
    bank_account_id: String(body.bankAccountId),
    statement_start: String(body.statementStart),
    statement_end: String(body.statementEnd),
    opening_balance: Number(body.openingBalance),
    closing_balance: Number(body.closingBalance),
    imported_at: new Date().toISOString(),
    provider_statement_id: body.providerStatementId ? String(body.providerStatementId) : null,
  }).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  const { data: acct } = await sb.from('acct_bank_accounts').select('name').eq('id', String(body.bankAccountId)).maybeSingle();
  return NextResponse.json({ data: toStatement(data, (acct?.name as string) || '') }, { status: 201 });
}
