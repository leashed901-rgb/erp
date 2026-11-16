import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';

/* Bank rules over acct_bank_rules + acct_bank_rule_conditions +
   acct_bank_rule_splits. A rule's categorization lives in its splits
   (line 1 = 100% to the category account in the screens' model).
   Vocab: applies_to money_in|money_out|both; match_mode all|any;
   condition fields description|payee|reference|amount|bank_text. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface RuleBody {
  name?: unknown;
  priority?: unknown;
  appliesTo?: unknown;
  matchMode?: unknown;
  txnType?: unknown;
  bankAccountIds?: unknown;
  autoConfirm?: unknown;
  isActive?: unknown;
  conditions?: unknown;
  categoryAccountId?: unknown;
  splits?: unknown;
}

async function loadRules() {
  const sb = supabaseAdmin();
  const { data: rules, error } = await sb
    .from('acct_bank_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  const ids = ((rules || []) as Record<string, unknown>[]).map((r) => String(r.id));
  const { data: conds } = ids.length
    ? await sb.from('acct_bank_rule_conditions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).in('rule_id', ids)
    : { data: [] };
  const { data: splits } = ids.length
    ? await sb.from('acct_bank_rule_splits').select('*').eq('tenant_id', DEFAULT_TENANT_ID).in('rule_id', ids).order('line_no', { ascending: true })
    : { data: [] };
  const { data: coa } = await sb.from('acct_chart_of_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID);
  const names = new Map(((coa || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name)]));

  return ((rules || []) as Record<string, unknown>[]).map((r) => {
    const id = String(r.id);
    const ruleSplits = ((splits || []) as Record<string, unknown>[])
      .filter((s) => String(s.rule_id) === id)
      .map((s) => ({
        id: String(s.id),
        lineNo: Number(s.line_no || 1),
        accountId: String(s.account_id),
        accountName: names.get(String(s.account_id)) || null,
        percent: s.percent != null ? Number(s.percent) : null,
        fixedAmount: s.fixed_amount != null ? Number(s.fixed_amount) : null,
      }));
    return {
      id,
      name: String(r.name || ''),
      priority: Number(r.priority || 0),
      appliesTo: String(r.applies_to || 'both'),
      matchMode: String(r.match_mode || 'all'),
      txnType: String(r.txn_type || 'expense'),
      bankAccountIds: (r.bank_account_ids as string[]) || [],
      autoConfirm: r.auto_confirm === true,
      isActive: r.is_active !== false,
      timesApplied: Number(r.times_applied || 0),
      lastAppliedAt: (r.last_applied_at as string) || null,
      conditions: ((conds || []) as Record<string, unknown>[])
        .filter((c) => String(c.rule_id) === id)
        .map((c) => ({
          id: String(c.id),
          field: String(c.field || 'description'),
          operator: String(c.operator || 'contains'),
          value: String(c.value || ''),
          value2: (c.value2 as string) || null,
          caseSensitive: c.case_sensitive === true,
        })),
      splits: ruleSplits,
      categoryAccountId: ruleSplits[0]?.accountId || null,
      categoryLabel: ruleSplits[0]?.accountName || null,
    };
  });
}

export async function GET() {
  try {
    return NextResponse.json({ data: await loadRules() });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Failed to load rules', 500);
  }
}

function parseConditions(raw: unknown): { field: string; operator: string; value: string; value2: string | null; caseSensitive: boolean }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      field: typeof c.field === 'string' ? c.field : 'description',
      operator: typeof c.operator === 'string' ? c.operator : 'contains',
      value: typeof c.value === 'string' ? c.value : String(c.value ?? ''),
      value2: typeof c.value2 === 'string' ? c.value2 : null,
      caseSensitive: c.caseSensitive === true,
    }))
    .filter((c) => c.value !== '');
}

function parseSplits(body: RuleBody): { accountId: string; percent: number | null }[] {
  if (Array.isArray(body.splits)) {
    return (body.splits as Record<string, unknown>[])
      .filter((s) => s && typeof s.accountId === 'string')
      .map((s) => ({ accountId: s.accountId as string, percent: typeof s.percent === 'number' ? s.percent : null }));
  }
  if (typeof body.categoryAccountId === 'string' && body.categoryAccountId) {
    return [{ accountId: body.categoryAccountId, percent: 100 }];
  }
  return [];
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RuleBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const conditions = parseConditions(body.conditions);
  if (!conditions.length) return err('VALIDATION', 'at least one condition is required', 400);
  const splits = parseSplits(body);
  if (!splits.length) return err('VALIDATION', 'a category account (split) is required', 400);
  const entityId = await tenantEntityId();
  if (!entityId) return err('INTERNAL', 'No accounting entity exists for this tenant', 500);

  const sb = supabaseAdmin();
  const { data: rule, error } = await sb
    .from('acct_bank_rules')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      name,
      priority: typeof body.priority === 'number' ? body.priority : 100,
      applies_to: typeof body.appliesTo === 'string' ? body.appliesTo : 'both',
      /* "All accounts" must be NULL, not []: acct_bank_rule_matches
         treats a non-NULL array as a whitelist, and an empty array
         whitelists nothing — every transaction would be rejected. */
      bank_account_ids: Array.isArray(body.bankAccountIds) && body.bankAccountIds.length ? body.bankAccountIds : null,
      match_mode: typeof body.matchMode === 'string' ? body.matchMode : 'all',
      txn_type: typeof body.txnType === 'string' ? body.txnType : 'expense',
      auto_confirm: body.autoConfirm === true,
      is_active: body.isActive !== false,
      times_applied: 0,
      dimensions: {},
      stop_processing: false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const ruleId = String((rule as { id: string }).id);

  const { error: condErr } = await sb.from('acct_bank_rule_conditions').insert(
    conditions.map((c) => ({
      tenant_id: DEFAULT_TENANT_ID,
      rule_id: ruleId,
      field: c.field,
      operator: c.operator,
      value: c.value,
      value2: c.value2,
      case_sensitive: c.caseSensitive,
    })),
  );
  if (condErr) return err('INTERNAL', condErr.message, 500);
  const { error: splitErr } = await sb.from('acct_bank_rule_splits').insert(
    splits.map((s, i) => ({
      tenant_id: DEFAULT_TENANT_ID,
      rule_id: ruleId,
      line_no: i + 1,
      account_id: s.accountId,
      percent: s.percent,
      dimensions: {},
    })),
  );
  if (splitErr) return err('INTERNAL', splitErr.message, 500);

  const all = await loadRules();
  return NextResponse.json({ data: all.find((r) => r.id === ruleId) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RuleBody & { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.priority === 'number') patch.priority = body.priority;
  if (typeof body.appliesTo === 'string') patch.applies_to = body.appliesTo;
  if (typeof body.matchMode === 'string') patch.match_mode = body.matchMode;
  if (typeof body.txnType === 'string') patch.txn_type = body.txnType;
  if (Array.isArray(body.bankAccountIds)) patch.bank_account_ids = body.bankAccountIds.length ? body.bankAccountIds : null;
  if (typeof body.autoConfirm === 'boolean') patch.auto_confirm = body.autoConfirm;
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
  if (Object.keys(patch).length) {
    const { error } = await sb.from('acct_bank_rules').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
    if (error) return err('INTERNAL', error.message, 500);
  }
  if (body.conditions !== undefined) {
    const conditions = parseConditions(body.conditions);
    await sb.from('acct_bank_rule_conditions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('rule_id', id);
    if (conditions.length) {
      const { error } = await sb.from('acct_bank_rule_conditions').insert(
        conditions.map((c) => ({
          tenant_id: DEFAULT_TENANT_ID,
          rule_id: id,
          field: c.field,
          operator: c.operator,
          value: c.value,
          value2: c.value2,
          case_sensitive: c.caseSensitive,
        })),
      );
      if (error) return err('INTERNAL', error.message, 500);
    }
  }
  if (body.splits !== undefined || body.categoryAccountId !== undefined) {
    const splits = parseSplits(body);
    await sb.from('acct_bank_rule_splits').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('rule_id', id);
    if (splits.length) {
      const { error } = await sb.from('acct_bank_rule_splits').insert(
        splits.map((s, i) => ({
          tenant_id: DEFAULT_TENANT_ID,
          rule_id: id,
          line_no: i + 1,
          account_id: s.accountId,
          percent: s.percent,
          dimensions: {},
        })),
      );
      if (error) return err('INTERNAL', error.message, 500);
    }
  }
  const all = await loadRules();
  const dto = all.find((r) => r.id === id);
  if (!dto) return err('NOT_FOUND', 'Rule not found', 404);
  return NextResponse.json({ data: dto });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  await sb.from('acct_bank_rule_conditions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('rule_id', id);
  await sb.from('acct_bank_rule_splits').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('rule_id', id);
  const { error } = await sb.from('acct_bank_rules').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
