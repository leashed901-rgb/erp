import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { BankDeposit } from '@/lib/bankDetailTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toDeposit = (r: Record<string, unknown>, accountName = '', lineCount = 0): BankDeposit => ({
  id: String(r.id),
  depositNumber: String(r.deposit_number || ''),
  bankAccountId: String(r.bank_account_id || ''),
  bankAccountName: accountName,
  depositDate: String(r.deposit_date || ''),
  memo: (r.memo as string) || null,
  total: Number(r.total || 0),
  cashBackAmount: Number(r.cash_back_amount || 0),
  status: String(r.status || ''),
  postedJournalId: (r.posted_journal_id as string) || null,
  bankTransactionId: (r.bank_transaction_id as string) || null,
  lineCount,
});

/** GET /api/bank-deposits — bank deposits with account names + line counts. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_bank_deposits')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('deposit_date', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data || [];
  const accountIds = [...new Set(rows.map((r) => r.bank_account_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (accountIds.length) {
    const { data: accts } = await sb.from('acct_bank_accounts').select('id,name').in('id', accountIds);
    (accts || []).forEach((a) => names.set(a.id, a.name));
  }
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: lines } = await sb.from('acct_bank_deposit_lines').select('deposit_id').in('deposit_id', ids);
    (lines || []).forEach((l) => counts.set(l.deposit_id, (counts.get(l.deposit_id) || 0) + 1));
  }
  return NextResponse.json({ data: rows.map((r) => toDeposit(r, names.get(r.bank_account_id) || '', counts.get(r.id) || 0)) });
}

/**
 * POST /api/bank-deposits — record a deposit via acct_make_deposit.
 * Body: { bankAccountId, date, receiptIds?, otherLines?: [{accountId, amount, description?, receivedFrom?}], memo?, cashBack?, cashBackAccountId? }.
 * At least one receipt or one other line is required — a deposit with
 * nothing in it is not a deposit.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.bankAccountId) return err('VALIDATION', 'bankAccountId is required', 400);
  if (!body.date) return err('VALIDATION', 'date is required', 400);
  const receiptIds = Array.isArray(body.receiptIds) ? (body.receiptIds as unknown[]).map(String) : [];
  const otherLines = Array.isArray(body.otherLines)
    ? (body.otherLines as Record<string, unknown>[]).map((l) => ({
        account_id: String(l.accountId || ''),
        amount: Number(l.amount || 0),
        description: l.description ? String(l.description) : null,
        received_from: l.receivedFrom ? String(l.receivedFrom) : null,
      })).filter((l) => l.account_id && l.amount > 0)
    : [];
  if (!receiptIds.length && !otherLines.length) {
    return err('VALIDATION', 'Pick at least one receipt or add a deposit line', 400);
  }
  const sb = supabaseAdmin();
  const { data: depositId, error } = await sb.rpc('acct_make_deposit', {
    p_bank_account_id: String(body.bankAccountId),
    p_date: String(body.date),
    p_receipt_ids: receiptIds,
    p_other_lines: otherLines,
    p_memo: body.memo ? String(body.memo) : null,
    p_cash_back: body.cashBack != null ? Number(body.cashBack) : null,
    p_cash_back_account_id: body.cashBackAccountId ? String(body.cashBackAccountId) : null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: row } = await sb.from('acct_bank_deposits').select('*').eq('id', depositId).single();
  if (!row) return err('INTERNAL', 'Deposit created but could not be read back', 500);
  const { data: acct } = await sb.from('acct_bank_accounts').select('name').eq('id', String(body.bankAccountId)).maybeSingle();
  const { data: lines } = await sb.from('acct_bank_deposit_lines').select('id').eq('deposit_id', depositId);
  return NextResponse.json({ data: toDeposit(row, (acct?.name as string) || '', (lines || []).length) }, { status: 201 });
}
