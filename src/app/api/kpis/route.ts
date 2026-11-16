import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/kpis?from=&to= — KPI values for a range (Batch I). The
 * engine (acct_kpis) auto-seeds the definitions when none exist,
 * evaluates each one against the GL for the range and the prior
 * period, and returns code / name / unit / value / prior_value.
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  if (!from || !to) return err('VALIDATION', 'from and to are required (YYYY-MM-DD)', 400);
  if (from > to) return err('VALIDATION', 'from must be on or before to', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_kpis', { p_tenant_id: DEFAULT_TENANT_ID, p_from: from, p_to: to });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((k) => ({
      code: k.code,
      name: k.name,
      unit: k.unit,
      value: k.value == null ? null : Number(k.value),
      priorValue: k.prior_value == null ? null : Number(k.prior_value),
      formula: k.formula,
    })),
    meta: { from, to },
  });
}
