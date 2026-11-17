import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/allocations — cost allocations (Batch I). An allocation
 * spreads a source account's balance across destination accounts
 * (by percentage or fixed amount), driven by a dimension.
 * POST — create (name + source account; driver dimension optional).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_allocations').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  const ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
  const ruleCounts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rules } = await sb.from('acct_allocation_rules').select('allocation_id').in('allocation_id', ids.slice(i, i + 100));
      for (const r of (rules ?? []) as { allocation_id: string }[]) ruleCounts.set(r.allocation_id, (ruleCounts.get(r.allocation_id) || 0) + 1);
    }
  }
  const sourceIds = [...new Set(((data ?? []) as { source_account_id: string | null }[]).map((a) => a.source_account_id).filter(Boolean))] as string[];
  const driverIds = [...new Set(((data ?? []) as { driver_dimension_id: string | null }[]).map((a) => a.driver_dimension_id).filter(Boolean))] as string[];
  const [{ data: accounts }, { data: dims }] = await Promise.all([
    sourceIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', sourceIds) : Promise.resolve({ data: [] }),
    driverIds.length ? sb.from('acct_dimensions').select('id, code, name').in('id', driverIds) : Promise.resolve({ data: [] }),
  ]);
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  const dimById = new Map(((dims ?? []) as Record<string, unknown>[]).map((d) => [d.id, `${d.code} — ${d.name}`]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: a.id,
      name: a.name,
      allocationType: a.allocation_type,
      sourceAccountId: a.source_account_id,
      sourceAccount: (accountById.get(a.source_account_id as string) as string) || '—',
      driverDimensionId: a.driver_dimension_id,
      driverDimension: (dimById.get(a.driver_dimension_id as string) as string) || '—',
      effectiveFrom: a.effective_from,
      effectiveTo: a.effective_to,
      active: a.active,
      ruleCount: ruleCounts.get(a.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const sourceAccountId = String(body.sourceAccountId || '');
  const driverDimensionId = body.driverDimensionId ? String(body.driverDimensionId) : null;
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!sourceAccountId) return err('VALIDATION', 'sourceAccountId is required', 400);
  const sb = supabaseAdmin();
  const { data: account } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', sourceAccountId).single();
  if (!account) return err('VALIDATION', 'Unknown source account', 400);
  if (driverDimensionId) {
    const { data: dim } = await sb.from('acct_dimensions').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', driverDimensionId).single();
    if (!dim) return err('VALIDATION', 'Unknown driver dimension', 400);
  }
  const { data, error } = await sb.from('acct_allocations').insert({
    tenant_id: DEFAULT_TENANT_ID,
    name,
    allocation_type: body.allocationType ? String(body.allocationType) : null,
    source_account_id: sourceAccountId,
    driver_dimension_id: driverDimensionId,
    effective_from: body.effectiveFrom ? String(body.effectiveFrom).slice(0, 10) : null,
    effective_to: body.effectiveTo ? String(body.effectiveTo).slice(0, 10) : null,
    active: body.active !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, allocationType: data.allocation_type, sourceAccountId: data.source_account_id, active: data.active, ruleCount: 0 } }, { status: 201 });
}
