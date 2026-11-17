import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';
import { toCoaAccount, UI_TYPE_TO_RAW, UI_TYPE_NORMAL_BALANCE, detailSlug, type AcctUiType } from '@/lib/acctTypes';

/* Chart of accounts over acct_chart_of_accounts. Balances are the
   real GL balances: opening_balance + movement on posted,
   non-reversal journal entries. Bank balances come from the linked
   acct_bank_accounts feed (opening + acct_bank_transactions). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function loadAccounts() {
  const sb = supabaseAdmin();
  const { data: accounts, error } = await sb
    .from('acct_chart_of_accounts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (accounts || []) as Record<string, unknown>[];

  const { data: entries } = await sb
    .from('acct_journal_entries')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'posted')
    .is('reversal_of_id', null);
  const entryIds = new Set(((entries || []) as { id: string }[]).map((e) => e.id));

  const movement = new Map<string, number>();
  if (entryIds.size) {
    const { data: lines } = await sb
      .from('acct_journal_lines')
      .select('account_id, journal_entry_id, debit, credit')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(10000);
    for (const l of (lines || []) as Record<string, unknown>[]) {
      if (!entryIds.has(String(l.journal_entry_id))) continue;
      const acct = rows.find((a) => String(a.id) === String(l.account_id));
      if (!acct) continue;
      const signed = acct.normal_balance === 'credit'
        ? Number(l.credit || 0) - Number(l.debit || 0)
        : Number(l.debit || 0) - Number(l.credit || 0);
      movement.set(String(l.account_id), (movement.get(String(l.account_id)) || 0) + signed);
    }
  }

  const { data: bankAccts } = await sb
    .from('acct_bank_accounts')
    .select('id, gl_account_id, opening_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const bankByGl = new Map<string, { id: string; opening: number }>();
  for (const b of (bankAccts || []) as Record<string, unknown>[]) {
    if (b.gl_account_id) bankByGl.set(String(b.gl_account_id), { id: String(b.id), opening: Number(b.opening_balance || 0) });
  }
  const bankSums = new Map<string, number>();
  if (bankByGl.size) {
    const { data: txns } = await sb
      .from('acct_bank_transactions')
      .select('bank_account_id, amount')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(10000);
    for (const t of (txns || []) as Record<string, unknown>[]) {
      bankSums.set(String(t.bank_account_id), (bankSums.get(String(t.bank_account_id)) || 0) + Number(t.amount || 0));
    }
  }

  return rows.map((r) => {
    const id = String(r.id);
    const balance = Number(r.opening_balance || 0) + (movement.get(id) || 0);
    const bank = bankByGl.get(id);
    const bankBalance = bank ? bank.opening + (bankSums.get(bank.id) || 0) : null;
    return toCoaAccount(r, balance, bankBalance);
  });
}

export async function GET() {
  try {
    return NextResponse.json({ data: await loadAccounts() });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Failed to load accounts', 500);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const uiType = typeof body.type === 'string' ? (body.type as AcctUiType) : null;
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!code) return err('VALIDATION', 'code (account number) is required', 400);
  if (!uiType || !UI_TYPE_TO_RAW[uiType]) return err('VALIDATION', 'a valid account type is required', 400);
  const entityId = await tenantEntityId();
  if (!entityId) return err('INTERNAL', 'No accounting entity exists for this tenant', 500);

  const detail = typeof body.detail === 'string' ? body.detail : '';
  const slug = detailSlug(detail);
  const taxLine = typeof body.taxLine === 'string' && body.taxLine && body.taxLine !== '—' ? body.taxLine : null;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_chart_of_accounts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      parent_account_id: typeof body.parentAccountId === 'string' ? body.parentAccountId : null,
      code,
      name,
      account_type: UI_TYPE_TO_RAW[uiType],
      normal_balance: UI_TYPE_NORMAL_BALANCE[uiType],
      subtype: slug,
      detail_type: slug,
      description: typeof body.description === 'string' ? body.description : null,
      currency: 'USD',
      is_control_account: false,
      is_reconcilable: ['checking', 'savings', 'accounts_receivable', 'accounts_payable'].includes(slug || ''),
      is_posting_allowed: true,
      is_system: false,
      is_active: body.isActive !== false,
      is_bank_feed: slug === 'checking' || slug === 'savings',
      opening_balance: typeof body.openingBalance === 'number' ? body.openingBalance : 0,
      opening_balance_date: typeof body.openingDate === 'string' && body.openingDate ? body.openingDate : null,
      sort_order: 0,
      metadata: taxLine ? { taxLine } : {},
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const row = data as Record<string, unknown>;
  return NextResponse.json({ data: toCoaAccount(row, Number(row.opening_balance || 0), null) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.code === 'string') patch.code = body.code;
  if (typeof body.type === 'string' && UI_TYPE_TO_RAW[body.type as AcctUiType]) {
    patch.account_type = UI_TYPE_TO_RAW[body.type as AcctUiType];
    patch.normal_balance = UI_TYPE_NORMAL_BALANCE[body.type as AcctUiType];
  }
  if (typeof body.detail === 'string') {
    const slug = detailSlug(body.detail);
    patch.detail_type = slug;
    patch.subtype = slug;
  }
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
  if (typeof body.openingBalance === 'number') patch.opening_balance = body.openingBalance;
  if ('parentAccountId' in body) patch.parent_account_id = typeof body.parentAccountId === 'string' ? body.parentAccountId : null;
  if (typeof body.taxLine === 'string') {
    const sb0 = supabaseAdmin();
    const { data: cur } = await sb0.from('acct_chart_of_accounts').select('metadata').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
    const meta = { ...((cur as { metadata?: Record<string, unknown> } | null)?.metadata || {}) };
    if (body.taxLine && body.taxLine !== '—') meta.taxLine = body.taxLine;
    else delete meta.taxLine;
    patch.metadata = meta;
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_chart_of_accounts')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Account not found', 404);
  const all = await loadAccounts();
  const dto = all.find((a) => a.id === id);
  return NextResponse.json({ data: dto || toCoaAccount(data as Record<string, unknown>, 0, null) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('acct_chart_of_accounts').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
