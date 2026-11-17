import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/allocations/[id] — one allocation + its rules (Batch I).
 * PATCH — name / type / driver / dates / active. DELETE — removes
 * the rules first, then the allocation.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: alloc, error }, { data: rules }] = await Promise.all([
    sb.from('acct_allocations').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_allocation_rules').select('*').eq('allocation_id', id),
  ]);
  if (error || !alloc) return err('NOT_FOUND', 'Allocation not found', 404);
  const destIds = [...new Set(((rules ?? []) as { destination_account_id: string | null }[]).map((r) => r.destination_account_id).filter(Boolean))] as string[];
  const { data: accounts } = destIds.length
    ? await sb.from('acct_chart_of_accounts').select('id, code, name').in('id', destIds)
    : { data: [] };
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  return NextResponse.json({
    data: {
      id: alloc.id,
      name: alloc.name,
      allocationType: alloc.allocation_type,
      sourceAccountId: alloc.source_account_id,
      driverDimensionId: alloc.driver_dimension_id,
      effectiveFrom: alloc.effective_from,
      effectiveTo: alloc.effective_to,
      active: alloc.active,
      rules: ((rules ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        destinationAccountId: r.destination_account_id,
        destinationAccount: (accountById.get(r.destination_account_id as string) as string) || '—',
        percentage: r.percentage == null ? null : Number(r.percentage),
        fixedAmount: r.fixed_amount == null ? null : Number(r.fixed_amount),
        dimensions: r.dimensions,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.allocationType !== undefined) patch.allocation_type = body.allocationType ? String(body.allocationType) : null;
  if (body.driverDimensionId !== undefined) patch.driver_dimension_id = body.driverDimensionId ? String(body.driverDimensionId) : null;
  if (body.effectiveFrom !== undefined) patch.effective_from = body.effectiveFrom ? String(body.effectiveFrom).slice(0, 10) : null;
  if (body.effectiveTo !== undefined) patch.effective_to = body.effectiveTo ? String(body.effectiveTo).slice(0, 10) : null;
  if (body.active !== undefined) patch.active = !!body.active;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_allocations').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Allocation not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, active: data.active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: alloc } = await sb.from('acct_allocations').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!alloc) return err('NOT_FOUND', 'Allocation not found', 404);
  await sb.from('acct_allocation_rules').delete().eq('allocation_id', id);
  const { error } = await sb.from('acct_allocations').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
