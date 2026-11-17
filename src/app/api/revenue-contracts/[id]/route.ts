import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/revenue-contracts/[id] — one contract with its performance
 * obligations and their recognition schedule rows (Batch H).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: c, error } = await supabaseAdmin().from('acct_revenue_contracts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !c) return err('NOT_FOUND', 'Revenue contract not found', 404);
  const row = c as Record<string, unknown>;
  const [{ data: obs }] = await Promise.all([
    supabaseAdmin().from('acct_revenue_performance_obligations').select('*').eq('contract_id', id).order('obligation_code'),
  ]);
  const { data: party } = await supabaseAdmin().from('platform_parties').select('id, metadata').eq('id', row.customer_id as string).single();
  const partyRow = (party ?? null) as Record<string, unknown> | null;
  const obRows = (obs ?? []) as Record<string, unknown>[];
  const obIds = obRows.map((o) => o.id as string);
  const { data: schedules } = obIds.length
    ? await supabaseAdmin().from('acct_revenue_recognition_schedules').select('*').in('obligation_id', obIds).order('id')
    : { data: [] };
  const periodIds = [...new Set(((schedules ?? []) as Record<string, unknown>[]).map((s) => s.period_id as string).filter(Boolean))];
  const { data: periods } = periodIds.length
    ? await supabaseAdmin().from('acct_periods').select('id, name').in('id', periodIds)
    : { data: [] };
  const periodById = new Map(((periods ?? []) as Record<string, unknown>[]).map((p) => [p.id, p.name]));
  const schedByOb = new Map<string, Record<string, unknown>[]>();
  for (const s of (schedules ?? []) as Record<string, unknown>[]) {
    const arr = schedByOb.get(s.obligation_id as string) ?? [];
    arr.push(s);
    schedByOb.set(s.obligation_id as string, arr);
  }
  const partyMeta = (partyRow?.metadata ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: row.id,
      contractNumber: row.contract_number,
      customerId: row.customer_id,
      customerName: partyMeta ? String(partyMeta.name || '') : null,
      contractDate: row.contract_date,
      startDate: row.start_date,
      endDate: row.end_date,
      totalPrice: Number(row.total_transaction_price || 0),
      status: row.status,
      obligations: obRows.map((o) => ({
        id: o.id,
        code: o.obligation_code,
        description: o.description,
        standalonePrice: Number(o.standalone_price || 0),
        allocatedPrice: Number(o.allocated_price || 0),
        method: o.recognition_method,
        start: o.recognition_start,
        end: o.recognition_end,
        deferredAccountId: o.deferred_revenue_account_id,
        revenueAccountId: o.revenue_account_id,
        schedules: (schedByOb.get(o.id as string) ?? []).map((s) => ({
          id: s.id,
          obligationId: s.obligation_id,
          obligationCode: o.obligation_code,
          periodId: s.period_id,
          periodName: periodById.get(s.period_id as string) ?? null,
          scheduledAmount: Number(s.scheduled_amount || 0),
          recognizedAmount: Number(s.recognized_amount || 0),
          journalId: s.journal_id,
          status: s.status,
        })),
      })),
    },
  });
}
