import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/budgets/[id]/from-actuals — fill the budget from a prior
 * year's actuals (Batch I). The engine deletes the version's existing
 * lines first, then inserts one line per account per month of the
 * budget's fiscal year, scaled by growthPct. Returns the line count.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sourceYear = Number(body.sourceYear);
  const growthPct = Number(body.growthPct || 0);
  if (!Number.isInteger(sourceYear) || sourceYear < 2000 || sourceYear > 2100) return err('VALIDATION', 'sourceYear is required (e.g. 2025)', 400);
  if (!Number.isFinite(growthPct)) return err('VALIDATION', 'growthPct must be a number', 400);
  const sb = supabaseAdmin();
  const { data: version } = await sb.from('acct_budget_versions').select('id, status').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!version) return err('NOT_FOUND', 'Budget not found', 404);
  if (['locked', 'archived'].includes(String(version.status))) return err('VALIDATION', `A ${version.status} budget cannot be refilled from actuals`, 400);
  const { data, error } = await sb.rpc('acct_budget_from_actuals', { p_budget_id: id, p_source_year: sourceYear, p_growth_pct: growthPct });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { budgetId: id, sourceYear, growthPct, linesInserted: data ?? 0 } });
}
