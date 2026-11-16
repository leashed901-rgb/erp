import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/intercompany-partners — entity pairs that trade with each
 * other (Batch I). POST — define a pair (from/to entity + the due
 * from/to accounts + optional markup). DELETE ?id=.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_intercompany_partners').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('from_entity_id');
  if (error) return err('INTERNAL', error.message, 500);
  const entityIds = [...new Set(((data ?? []) as { from_entity_id: string; to_entity_id: string }[]).flatMap((p) => [p.from_entity_id, p.to_entity_id]))] as string[];
  const { data: entities } = entityIds.length
    ? await sb.from('acct_entities').select('id, legal_name, display_name').in('id', entityIds)
    : { data: [] };
  const entityById = new Map(((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id, (e.display_name as string) || (e.legal_name as string)]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      fromEntityId: p.from_entity_id,
      fromEntity: (entityById.get(p.from_entity_id as string) as string) || '—',
      toEntityId: p.to_entity_id,
      toEntity: (entityById.get(p.to_entity_id as string) as string) || '—',
      dueFromAccountId: p.due_from_account_id,
      dueToAccountId: p.due_to_account_id,
      markupPercent: p.markup_percent == null ? null : Number(p.markup_percent),
      isActive: p.is_active,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const fromEntityId = String(body.fromEntityId || '');
  const toEntityId = String(body.toEntityId || '');
  const dueFromAccountId = body.dueFromAccountId ? String(body.dueFromAccountId) : null;
  const dueToAccountId = body.dueToAccountId ? String(body.dueToAccountId) : null;
  if (!fromEntityId) return err('VALIDATION', 'fromEntityId is required', 400);
  if (!toEntityId) return err('VALIDATION', 'toEntityId is required', 400);
  if (fromEntityId === toEntityId) return err('VALIDATION', 'from and to entities must differ', 400);
  if (!dueFromAccountId) return err('VALIDATION', 'dueFromAccountId is required (due-from GL account)', 400);
  if (!dueToAccountId) return err('VALIDATION', 'dueToAccountId is required (due-to GL account)', 400);
  const sb = supabaseAdmin();
  const [{ data: from }, { data: to }] = await Promise.all([
    sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', fromEntityId).single(),
    sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', toEntityId).single(),
  ]);
  if (!from || !to) return err('VALIDATION', 'Unknown entity', 400);
  const { data: dueFrom } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', dueFromAccountId).single();
  const { data: dueTo } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', dueToAccountId).single();
  if (!dueFrom || !dueTo) return err('VALIDATION', 'Unknown due-from / due-to account', 400);
  const { data, error } = await sb.from('acct_intercompany_partners').insert({
    tenant_id: DEFAULT_TENANT_ID,
    from_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    due_from_account_id: dueFromAccountId,
    due_to_account_id: dueToAccountId,
    markup_percent: body.markupPercent == null ? null : Number(body.markupPercent),
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, fromEntityId: data.from_entity_id, toEntityId: data.to_entity_id, isActive: data.is_active } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_intercompany_partners').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
