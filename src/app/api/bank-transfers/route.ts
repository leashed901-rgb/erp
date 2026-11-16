import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { BankTransfer } from '@/lib/bankDetailTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export const toTransfer = (r: Record<string, unknown>, fromName = '', toName = ''): BankTransfer => ({
  id: String(r.id),
  fromAccountId: String(r.from_account_id || ''),
  fromAccountName: fromName,
  toAccountId: String(r.to_account_id || ''),
  toAccountName: toName,
  transferDate: String(r.transfer_date || ''),
  amount: Number(r.amount || 0),
  memo: (r.memo as string) || null,
  status: String(r.status || ''),
  journalEntryId: (r.journal_entry_id as string) || null,
  voidJournalId: (r.void_journal_id as string) || null,
});

/** GET /api/bank-transfers — transfers with from/to account names. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_bank_transfers')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('transfer_date', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data || [];
  const accountIds = [...new Set(rows.flatMap((r) => [r.from_account_id, r.to_account_id]).filter(Boolean))];
  const names = new Map<string, string>();
  if (accountIds.length) {
    const { data: accts } = await sb.from('acct_bank_accounts').select('id,name').in('id', accountIds);
    (accts || []).forEach((a) => names.set(a.id, a.name));
  }
  return NextResponse.json({ data: rows.map((r) => toTransfer(r, names.get(r.from_account_id) || '', names.get(r.to_account_id) || '')) });
}

/**
 * POST /api/bank-transfers — move money between bank accounts via
 * acct_transfer_funds (posts both sides of the journal).
 * Body: { fromAccountId, toAccountId, date, amount, memo? }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.fromAccountId) return err('VALIDATION', 'fromAccountId is required', 400);
  if (!body.toAccountId) return err('VALIDATION', 'toAccountId is required', 400);
  if (String(body.fromAccountId) === String(body.toAccountId)) {
    return err('VALIDATION', 'from and to accounts must differ', 400);
  }
  if (!body.date) return err('VALIDATION', 'date is required', 400);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount must be greater than 0', 400);
  const sb = supabaseAdmin();
  const { data: transferId, error } = await sb.rpc('acct_transfer_funds', {
    p_from_account_id: String(body.fromAccountId),
    p_to_account_id: String(body.toAccountId),
    p_date: String(body.date),
    p_amount: amount,
    p_memo: body.memo ? String(body.memo) : null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: row } = await sb.from('acct_bank_transfers').select('*').eq('id', transferId).single();
  if (!row) return err('INTERNAL', 'Transfer created but could not be read back', 500);
  return NextResponse.json({ data: toTransfer(row) }, { status: 201 });
}
