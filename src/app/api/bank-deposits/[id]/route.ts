import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toDeposit } from '../route';
import type { BankDepositLine } from '@/lib/bankDetailTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/bank-deposits/[id] — deposit detail with its lines. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('acct_bank_deposits')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!row) return err('NOT_FOUND', 'Deposit not found', 404);
  const { data: lines } = await sb
    .from('acct_bank_deposit_lines')
    .select('*')
    .eq('deposit_id', id)
    .order('id');
  const accountIds = [...new Set(((lines || []).map((l) => l.account_id).filter(Boolean)) as string[])];
  const names = new Map<string, string>();
  if (accountIds.length) {
    const { data: accts } = await sb.from('acct_chart_of_accounts').select('id,code,name').in('id', accountIds);
    (accts || []).forEach((a) => names.set(a.id, `${a.code} ${a.name}`));
  }
  const dtos: BankDepositLine[] = (lines || []).map((l) => ({
    id: String(l.id),
    depositId: String(l.deposit_id),
    receiptId: (l.receipt_id as string) || null,
    accountId: (l.account_id as string) || null,
    accountName: l.account_id ? (names.get(l.account_id) || null) : null,
    receivedFrom: (l.received_from as string) || null,
    description: (l.description as string) || null,
    amount: Number(l.amount || 0),
  }));
  return NextResponse.json({ data: toDeposit(row, '', (lines || []).length), lines: dtos });
}
