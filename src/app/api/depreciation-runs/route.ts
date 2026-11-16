import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/depreciation-runs — acct_asset_depreciation_runs with their
 * line totals (Batch H). POST — run depreciation through a date via
 * acct_run_depreciation. The engine snaps to whole months: a run
 * through Nov 30 depreciates Sep, Oct AND Nov; a run through Nov 15
 * stops at Oct 31. It returns a jsonb summary { run_id, assets, amount }.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_asset_depreciation_runs').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('run_date', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const runIds = ((data ?? []) as Record<string, unknown>[]).map((r) => r.id as string);
  const { data: lines } = runIds.length
    ? await supabaseAdmin().from('acct_asset_depreciation_lines').select('run_id, depreciation_amount').in('run_id', runIds)
    : { data: [] };
  const totals = new Map<string, { n: number; sum: number }>();
  for (const l of (lines ?? []) as Record<string, unknown>[]) {
    const t = totals.get(l.run_id as string) ?? { n: 0, sum: 0 };
    t.n += 1;
    t.sum += Number(l.depreciation_amount || 0);
    totals.set(l.run_id as string, t);
  }
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const t = totals.get(r.id as string) ?? { n: 0, sum: 0 };
      return {
        id: r.id,
        periodId: r.period_id,
        runDate: r.run_date,
        status: r.status,
        journalId: r.journal_id,
        postedAt: r.posted_at,
        total: t.sum,
        lines: [],
        lineCount: t.n,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const through = String(body.through || '').slice(0, 10);
  if (!through) return err('VALIDATION', 'Through date is required', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_run_depreciation', { p_tenant_id: DEFAULT_TENANT_ID, p_through: through });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
