import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toRun(r: Record<string, unknown>) {
  return {
    id: r.id, periodFrom: r.period_from, periodTo: r.period_to,
    findingCount: r.finding_count, newCount: r.new_count,
    runAt: r.run_at, summary: r.summary,
  };
}

/** GET /api/review-runs — file review runs, newest first. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_review_runs')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('run_at', { ascending: false })
    .limit(50);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: ((data ?? []) as Record<string, unknown>[]).map(toRun) });
}

/**
 * POST /api/review-runs — run the file review for a window (Batch G).
 * The engine inserts the run row and (re)creates findings, deduped by
 * fingerprint across runs — re-running does not duplicate findings.
 * Body: {from, to, params?} (params: large_txn_threshold,
 * receipt_required_over, stale_days, undeposited_days, checks[]).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const from = String(body.from || '');
  const to = String(body.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return err('VALIDATION', 'from and to must be YYYY-MM-DD', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_run_review', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_from: from,
    p_to: to,
    p_params: (body.params as Record<string, unknown>) ?? {},
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
