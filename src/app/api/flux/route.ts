import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/flux?from=&to= — flux analysis (Batch G). Compares the
 * window to the immediately prior window of the same length and flags
 * accounts whose change clears both thresholds (default $500 and 10%).
 * Defaults to the current month vs the prior month. Each row carries
 * its stored explanation, if one was written.
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const from = sp.get('from') || thisMonth;
  const to = sp.get('to') || now.toISOString().slice(0, 10);
  const amountThreshold = Number(sp.get('amountThreshold') || 500);
  const pctThreshold = Number(sp.get('pctThreshold') || 0.1);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return err('VALIDATION', 'from and to must be YYYY-MM-DD', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_flux_analysis', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_from: from,
    p_to: to,
    p_amount_threshold: amountThreshold,
    p_pct_threshold: pctThreshold,
    p_entity_id: null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      accountId: r.account_id,
      code: r.code,
      name: r.name,
      accountType: r.account_type,
      basis: r.basis,
      currentAmount: Number(r.current_amount),
      priorAmount: Number(r.prior_amount),
      change: Number(r.change),
      changePct: r.change_pct == null ? null : Number(r.change_pct),
      flagged: r.flagged,
      explanation: r.explanation,
      topDrivers: r.top_drivers ?? [],
    })),
    meta: { from, to, amountThreshold, pctThreshold },
  });
}
