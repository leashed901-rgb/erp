import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Consolidation members (Batch I). GET ?groupId= — entities in a
 * group. POST — add an entity (ownership + consolidation percent).
 * DELETE ?id= — remove a member. acct_consolidation_members has NO
 * tenant_id column — members are scoped through their group.
 */
export async function GET(req: NextRequest) {
  const groupId = new URL(req.url).searchParams.get('groupId');
  if (!groupId) return err('VALIDATION', 'groupId is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_consolidation_members').select('*').eq('consolidation_group_id', groupId);
  if (error) return err('INTERNAL', error.message, 500);
  const entityIds = [...new Set(((data ?? []) as { entity_id: string }[]).map((m) => m.entity_id))] as string[];
  const { data: entities } = entityIds.length
    ? await sb.from('acct_entities').select('id, legal_name, display_name').in('id', entityIds)
    : { data: [] };
  const entityById = new Map(((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id, (e.display_name as string) || (e.legal_name as string)]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id,
      groupId: m.consolidation_group_id,
      entityId: m.entity_id,
      entity: (entityById.get(m.entity_id as string) as string) || '—',
      ownershipPercent: m.ownership_percent == null ? null : Number(m.ownership_percent),
      consolidationPercent: m.consolidation_percent == null ? null : Number(m.consolidation_percent),
      effectiveFrom: m.effective_from,
      effectiveTo: m.effective_to,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const groupId = String(body.groupId || '');
  const entityId = String(body.entityId || '');
  const ownershipPercent = body.ownershipPercent == null ? null : Number(body.ownershipPercent);
  const consolidationPercent = body.consolidationPercent == null ? null : Number(body.consolidationPercent);
  if (!groupId) return err('VALIDATION', 'groupId is required', 400);
  if (!entityId) return err('VALIDATION', 'entityId is required', 400);
  if (ownershipPercent != null && (!Number.isFinite(ownershipPercent) || ownershipPercent < 0 || ownershipPercent > 100)) return err('VALIDATION', 'ownershipPercent must be 0–100', 400);
  if (consolidationPercent != null && (!Number.isFinite(consolidationPercent) || consolidationPercent < 0 || consolidationPercent > 100)) return err('VALIDATION', 'consolidationPercent must be 0–100', 400);
  const sb = supabaseAdmin();
  const [{ data: group }, { data: entity }, { data: existing }] = await Promise.all([
    sb.from('acct_consolidation_groups').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', groupId).single(),
    sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', entityId).single(),
    sb.from('acct_consolidation_members').select('id').eq('consolidation_group_id', groupId).eq('entity_id', entityId).maybeSingle(),
  ]);
  if (!group) return err('VALIDATION', 'Unknown consolidation group', 400);
  if (!entity) return err('VALIDATION', 'Unknown entity', 400);
  if (existing) return err('VALIDATION', 'That entity is already a member of this group', 400);
  const { data, error } = await sb.from('acct_consolidation_members').insert({
    consolidation_group_id: groupId,
    entity_id: entityId,
    ownership_percent: ownershipPercent,
    consolidation_percent: consolidationPercent,
    effective_from: body.effectiveFrom ? String(body.effectiveFrom).slice(0, 10) : new Date().toISOString().slice(0, 10),
    effective_to: body.effectiveTo ? String(body.effectiveTo).slice(0, 10) : null,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, groupId: data.consolidation_group_id, entityId: data.entity_id, ownershipPercent: data.ownership_percent == null ? null : Number(data.ownership_percent), consolidationPercent: data.consolidation_percent == null ? null : Number(data.consolidation_percent) } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_consolidation_members').delete().eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
