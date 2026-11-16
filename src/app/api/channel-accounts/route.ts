import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Channel accounts (Batch I). GET — per-entity, per-channel account
 * map: which GL accounts a channel's payout, fees, advertising,
 * shipping and reserve post to, and which clearing register its
 * settlements land in. POST — create (entity + channel + clearing
 * register). PATCH ?id= — edit the accounts. DELETE ?id=.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_channel_accounts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('channel');
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as Record<string, unknown>[]).flatMap((r) => [
    r.fee_account_id, r.advertising_account_id, r.shipping_account_id, r.reserve_account_id,
  ]).filter(Boolean))] as string[];
  const { data: accounts } = accountIds.length
    ? await sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds)
    : { data: [] };
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  const bankIds = [...new Set(((data ?? []) as Record<string, unknown>[]).map((r) => r.payout_bank_account_id).filter(Boolean))] as string[];
  const { data: banks } = bankIds.length
    ? await sb.from('acct_bank_accounts').select('id, name').in('id', bankIds)
    : { data: [] };
  const bankById = new Map(((banks ?? []) as Record<string, unknown>[]).map((b) => [b.id, b.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      channel: r.channel,
      clearingRegisterId: r.clearing_register_id,
      payoutBankAccountId: r.payout_bank_account_id,
      payoutBankAccount: (bankById.get(r.payout_bank_account_id as string) as string) || '—',
      feeAccountId: r.fee_account_id,
      feeAccount: (accountById.get(r.fee_account_id as string) as string) || '—',
      advertisingAccountId: r.advertising_account_id,
      advertisingAccount: (accountById.get(r.advertising_account_id as string) as string) || '—',
      shippingAccountId: r.shipping_account_id,
      shippingAccount: (accountById.get(r.shipping_account_id as string) as string) || '—',
      reserveAccountId: r.reserve_account_id,
      reserveAccount: (accountById.get(r.reserve_account_id as string) as string) || '—',
      isActive: r.is_active,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const entityId = String(body.entityId || '');
  const channel = String(body.channel || '').trim();
  const clearingRegisterId = String(body.clearingRegisterId || '');
  if (!entityId) return err('VALIDATION', 'entityId is required', 400);
  if (!channel) return err('VALIDATION', 'channel is required', 400);
  if (!clearingRegisterId) return err('VALIDATION', 'clearingRegisterId is required', 400);
  const sb = supabaseAdmin();
  const { data: entity } = await sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', entityId).single();
  if (!entity) return err('VALIDATION', 'Unknown entity', 400);
  // payout is a BANK account (payout_bank_account_id), not a GL
  // account: validated against acct_bank_accounts. The fee /
  // advertising / shipping / reserve accounts are GL accounts.
  const accountFields = ['feeAccountId', 'advertisingAccountId', 'shippingAccountId', 'reserveAccountId'] as const;
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    channel,
    clearing_register_id: clearingRegisterId,
    is_active: body.isActive !== false,
  };
  if (body.payoutBankAccountId) {
    const { data: bank } = await sb.from('acct_bank_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', String(body.payoutBankAccountId)).single();
    if (!bank) return err('VALIDATION', 'Unknown payout bank account', 400);
    insert.payout_bank_account_id = String(body.payoutBankAccountId);
  }
  const columnMap: Record<string, string> = {
    feeAccountId: 'fee_account_id',
    advertisingAccountId: 'advertising_account_id',
    shippingAccountId: 'shipping_account_id',
    reserveAccountId: 'reserve_account_id',
  };
  for (const f of accountFields) {
    if (body[f]) {
      const { data: account } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', String(body[f])).single();
      if (!account) return err('VALIDATION', `Unknown account for ${f}`, 400);
      insert[columnMap[f]] = String(body[f]);
    }
  }
  const { data, error } = await sb.from('acct_channel_accounts').insert(insert).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, entityId: data.entity_id, channel: data.channel, clearingRegisterId: data.clearing_register_id, isActive: data.is_active } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  const columnMap: Record<string, string> = {
    feeAccountId: 'fee_account_id',
    advertisingAccountId: 'advertising_account_id',
    shippingAccountId: 'shipping_account_id',
    reserveAccountId: 'reserve_account_id',
  };
  if (body.payoutBankAccountId !== undefined) patch.payout_bank_account_id = body.payoutBankAccountId ? String(body.payoutBankAccountId) : null;
  for (const [field, column] of Object.entries(columnMap)) {
    if (body[field] !== undefined) patch[column] = body[field] ? String(body[field]) : null;
  }
  if (body.clearingRegisterId !== undefined) patch.clearing_register_id = body.clearingRegisterId ? String(body.clearingRegisterId) : null;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  const { data, error } = await supabaseAdmin().from('acct_channel_accounts').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Channel account mapping not found', 404);
  return NextResponse.json({ data: { id: data.id, channel: data.channel, isActive: data.is_active } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_channel_accounts').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
