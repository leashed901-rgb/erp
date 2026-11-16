import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/consolidation-groups/[id] — one group + members + runs
 * (Batch I). PATCH — name / reporting currency / method. DELETE —
 * removes members and runs first, then the group.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: group, error }, { data: members }, { data: runs }] = await Promise.all([
    sb.from('acct_consolidation_groups').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_consolidation_members').select('*').eq('consolidation_group_id', id),
    sb.from('acct_consolidation_runs').select('*').eq('consolidation_group_id', id).order('created_at', { ascending: false }),
  ]);
  if (error || !group) return err('NOT_FOUND', 'Consolidation group not found', 404);
  const entityIds = [...new Set(((members ?? []) as { entity_id: string }[]).map((m) => m.entity_id))] as string[];
  const { data: entities } = entityIds.length
    ? await sb.from('acct_entities').select('id, legal_name, display_name').in('id', entityIds)
    : { data: [] };
  const entityById = new Map(((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id, (e.display_name as string) || (e.legal_name as string)]));
  return NextResponse.json({
    data: {
      id: group.id,
      code: group.code,
      name: group.name,
      reportingCurrency: group.reporting_currency,
      consolidationMethod: group.consolidation_method,
      members: ((members ?? []) as Record<string, unknown>[]).map((m) => ({
        id: m.id,
        entityId: m.entity_id,
        entity: (entityById.get(m.entity_id as string) as string) || '—',
        ownershipPercent: m.ownership_percent == null ? null : Number(m.ownership_percent),
        consolidationPercent: m.consolidation_percent == null ? null : Number(m.consolidation_percent),
        effectiveFrom: m.effective_from,
        effectiveTo: m.effective_to,
      })),
      runs: ((runs ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        periodId: r.period_id,
        status: r.status,
        reportingCurrency: r.reporting_currency,
        fxAdjustment: r.fx_adjustment == null ? null : Number(r.fx_adjustment),
        eliminationAmount: r.elimination_amount == null ? null : Number(r.elimination_amount),
        journalId: r.journal_id,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.reportingCurrency !== undefined) patch.reporting_currency = String(body.reportingCurrency || '').toUpperCase().slice(0, 3);
  if (body.consolidationMethod !== undefined) patch.consolidation_method = body.consolidationMethod ? String(body.consolidationMethod) : null;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_consolidation_groups').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Consolidation group not found', 404);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, reportingCurrency: data.reporting_currency } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: group } = await sb.from('acct_consolidation_groups').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!group) return err('NOT_FOUND', 'Consolidation group not found', 404);
  await sb.from('acct_consolidation_members').delete().eq('consolidation_group_id', id);
  await sb.from('acct_consolidation_runs').delete().eq('consolidation_group_id', id);
  const { error } = await sb.from('acct_consolidation_groups').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
