import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/close/periods — fiscal years + accounting periods (Batch G).
 * Each period carries its close (if one was generated) so the Periods
 * tab can show state and offer "Start close" exactly where it belongs.
 */
export async function GET() {
  const [{ data: years }, { data: periods }, { data: closes }] = await Promise.all([
    supabaseAdmin().from('acct_fiscal_years').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('fiscal_year', { ascending: true }),
    supabaseAdmin().from('acct_periods').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('start_date', { ascending: false }),
    supabaseAdmin().from('acct_closes').select('id,period_id,status').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  if (!periods) return err('INTERNAL', 'Could not load periods', 500);
  const closeByPeriod = new Map(((closes ?? []) as { id: string; period_id: string; status: string }[]).map((c) => [c.period_id, c]));
  return NextResponse.json({
    data: {
      fiscalYears: ((years ?? []) as Record<string, unknown>[]).map((y) => ({
        id: y.id, fiscalYear: y.fiscal_year, startDate: y.start_date, endDate: y.end_date,
      })),
      periods: (periods as Record<string, unknown>[]).map((p) => {
        const c = closeByPeriod.get(p.id as string);
        return {
          id: p.id,
          fiscalYearId: p.fiscal_year_id,
          periodNo: p.period_no,
          name: p.name,
          startDate: p.start_date,
          endDate: p.end_date,
          status: p.status,
          closedAt: p.closed_at,
          closeId: c?.id ?? null,
          closeStatus: c?.status ?? null,
        };
      }),
    },
  });
}
