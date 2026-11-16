import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/account-balances?periodId= — the per-period
 * closing balances the engine maintains (Batch I, read-only). These
 * are computed by posting, never typed in. ?periodId= filters to one
 * period; without it the latest 200 rows read.
 */
export async function GET(req: NextRequest) {
  const periodId = new URL(req.url).searchParams.get('periodId');
  const sb = supabaseAdmin();
  let query = sb.from('acct_account_balances').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('period_id', { ascending: false }).limit(200);
  if (periodId) query = query.eq('period_id', periodId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as { account_id: string }[]).map((b) => b.account_id))] as string[];
  const periodIds = [...new Set(((data ?? []) as { period_id: string }[]).map((b) => b.period_id))] as string[];
  const [{ data: accounts }, { data: periods }] = await Promise.all([
    accountIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
    periodIds.length ? sb.from('acct_periods').select('id, name').in('id', periodIds) : Promise.resolve({ data: [] }),
  ]);
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  const periodById = new Map(((periods ?? []) as Record<string, unknown>[]).map((p) => [p.id, p.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id,
      entityId: b.entity_id,
      bookId: b.book_id,
      accountId: b.account_id,
      account: (accountById.get(b.account_id as string) as string) || '—',
      periodId: b.period_id,
      period: (periodById.get(b.period_id as string) as string) || '—',
      debit: Number(b.debit || 0),
      credit: Number(b.credit || 0),
      closingDebit: Number(b.closing_debit || 0),
      closingCredit: Number(b.closing_credit || 0),
    })),
  });
}
