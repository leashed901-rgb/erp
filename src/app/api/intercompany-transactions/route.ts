import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const STATUSES = ['draft', 'pending', 'matched', 'posted', 'eliminated', 'disputed', 'cancelled'];

/**
 * GET /api/intercompany-transactions — intercompany trades (Batch I).
 * POST — record a transaction (from/to entity + date + currency +
 * amount; starts 'draft'). PATCH ?id= — move the status (the
 * CHECK on the table enforces the vocabulary).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_intercompany_transactions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('transaction_date', { ascending: false }).limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  const entityIds = [...new Set(((data ?? []) as { from_entity_id: string; to_entity_id: string }[]).flatMap((t) => [t.from_entity_id, t.to_entity_id]))] as string[];
  const { data: entities } = entityIds.length
    ? await sb.from('acct_entities').select('id, legal_name, display_name').in('id', entityIds)
    : { data: [] };
  const entityById = new Map(((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id, (e.display_name as string) || (e.legal_name as string)]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((t) => ({
      id: t.id,
      fromEntityId: t.from_entity_id,
      fromEntity: (entityById.get(t.from_entity_id as string) as string) || '—',
      toEntityId: t.to_entity_id,
      toEntity: (entityById.get(t.to_entity_id as string) as string) || '—',
      transactionDate: t.transaction_date,
      currency: t.currency,
      amount: Number(t.amount || 0),
      status: t.status,
      fromJournalId: t.from_journal_id,
      toJournalId: t.to_journal_id,
      eliminationRequired: t.elimination_required,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const fromEntityId = String(body.fromEntityId || '');
  const toEntityId = String(body.toEntityId || '');
  const transactionDate = String(body.transactionDate || '').slice(0, 10);
  const currency = String(body.currency || 'USD').toUpperCase().slice(0, 3);
  const amount = Number(body.amount);
  if (!fromEntityId) return err('VALIDATION', 'fromEntityId is required', 400);
  if (!toEntityId) return err('VALIDATION', 'toEntityId is required', 400);
  if (fromEntityId === toEntityId) return err('VALIDATION', 'from and to entities must differ', 400);
  if (!transactionDate) return err('VALIDATION', 'transactionDate is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount must be positive', 400);
  const sb = supabaseAdmin();
  const [{ data: from }, { data: to }] = await Promise.all([
    sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', fromEntityId).single(),
    sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', toEntityId).single(),
  ]);
  if (!from || !to) return err('VALIDATION', 'Unknown entity', 400);
  const { data, error } = await sb.from('acct_intercompany_transactions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    from_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    transaction_date: transactionDate,
    currency,
    amount,
    status: 'draft',
    from_journal_id: body.fromJournalId ? String(body.fromJournalId) : null,
    to_journal_id: body.toJournalId ? String(body.toJournalId) : null,
    elimination_required: body.eliminationRequired !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, fromEntityId: data.from_entity_id, toEntityId: data.to_entity_id, amount: Number(data.amount || 0), status: data.status } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '');
  if (!STATUSES.includes(status)) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
  const patch: Record<string, unknown> = { status };
  if (body.fromJournalId !== undefined) patch.from_journal_id = body.fromJournalId ? String(body.fromJournalId) : null;
  if (body.toJournalId !== undefined) patch.to_journal_id = body.toJournalId ? String(body.toJournalId) : null;
  if (body.eliminationRequired !== undefined) patch.elimination_required = !!body.eliminationRequired;
  const { data, error } = await supabaseAdmin().from('acct_intercompany_transactions').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Intercompany transaction not found', 404);
  return NextResponse.json({ data: { id: data.id, status: data.status } });
}
