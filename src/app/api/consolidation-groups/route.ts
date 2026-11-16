import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/consolidation-groups — consolidation groups (Batch I).
 * A group rolls several entities into one reporting currency.
 * POST — create (code + name + reporting currency + method).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_consolidation_groups').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code');
  if (error) return err('INTERNAL', error.message, 500);
  const ids = ((data ?? []) as { id: string }[]).map((g) => g.id);
  const memberCounts = new Map<string, number>();
  const runCounts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const [{ data: members }, { data: runs }] = await Promise.all([
        sb.from('acct_consolidation_members').select('group_id').in('group_id', chunk),
        sb.from('acct_consolidation_runs').select('group_id').in('group_id', chunk),
      ]);
      for (const m of (members ?? []) as { group_id: string }[]) memberCounts.set(m.group_id, (memberCounts.get(m.group_id) || 0) + 1);
      for (const r of (runs ?? []) as { group_id: string }[]) runCounts.set(r.group_id, (runCounts.get(r.group_id) || 0) + 1);
    }
  }
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      reportingCurrency: g.reporting_currency,
      consolidationMethod: g.consolidation_method,
      memberCount: memberCounts.get(g.id as string) || 0,
      runCount: runCounts.get(g.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const reportingCurrency = String(body.reportingCurrency || 'USD').toUpperCase().slice(0, 3);
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_consolidation_groups').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    reporting_currency: reportingCurrency,
    consolidation_method: body.consolidationMethod ? String(body.consolidationMethod) : null,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, reportingCurrency: data.reporting_currency, consolidationMethod: data.consolidation_method, memberCount: 0, runCount: 0 } }, { status: 201 });
}
