import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export function shapeRule(r: Record<string, unknown>, condition?: Record<string, unknown> | null, split?: Record<string, unknown> | null) {
  return {
    ...r,
    condition_keyword: condition?.value || null,
    condition_field: condition?.field || 'description',
    condition_operator: condition?.operator || 'contains',
    category_account_id: split?.account_id || null,
  };
}

/** GET /api/bank-rules — priority-ordered rules with their condition
 *  (description contains keyword) and split (category account). */
export async function GET() {
  const { data: rules, error } = await supabaseAdmin()
    .from('acct_bank_rules')
    .select('id, name, priority, applies_to, bank_account_ids, match_mode, txn_type, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, auto_confirm, is_active, times_applied, last_applied_at, stop_processing, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const ruleIds = (rules || []).map((r) => r.id);
  const { data: conditions } = ruleIds.length
    ? await supabaseAdmin()
        .from('acct_bank_rule_conditions')
        .select('id, rule_id, field, operator, value, value2, case_sensitive')
        .in('rule_id', ruleIds)
    : { data: [] };
  const { data: splits } = ruleIds.length
    ? await supabaseAdmin()
        .from('acct_bank_rule_splits')
        .select('id, rule_id, line_no, account_id, percent, fixed_amount, memo')
        .in('rule_id', ruleIds)
        .order('line_no', { ascending: true })
    : { data: [] };
  const condByRule = new Map<string, Record<string, unknown>>();
  for (const c of conditions || []) {
    if (!condByRule.has(c.rule_id)) condByRule.set(c.rule_id, c);
  }
  const splitByRule = new Map<string, Record<string, unknown>>();
  for (const s of splits || []) {
    if (!splitByRule.has(s.rule_id)) splitByRule.set(s.rule_id, s);
  }
  const catIds = [...new Set((splits || []).map((s) => s.account_id).filter(Boolean))];
  const { data: cats } = catIds.length
    ? await supabaseAdmin().from('acct_chart_of_accounts').select('id, code, name').in('id', catIds)
    : { data: [] };
  const catById = new Map((cats || []).map((c) => [c.id, c]));

  return NextResponse.json({
    data: (rules || []).map((r) => {
      const split = splitByRule.get(r.id);
      return {
        ...shapeRule(r, condByRule.get(r.id), split),
        category_name: split?.account_id ? catById.get(split.account_id as string)?.name || null : null,
        category_code: split?.account_id ? catById.get(split.account_id as string)?.code || null : null,
      };
    }),
    meta: { total: (rules || []).length },
  });
}

/** POST /api/bank-rules — create a rule: one condition + one split
 *  (100% to the category account). The condition field/operator,
 *  match_mode, bank scope and applies_to are the engine's own
 *  vocabulary (acct_bank_rule_matches) — stored as given. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  const keyword = String(body.condition_keyword || body.keyword || '').trim();
  const categoryAccountId = body.category_account_id as string | undefined;
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!keyword) return err('VALIDATION', 'condition_keyword is required', 400);
  if (!categoryAccountId) return err('VALIDATION', 'category_account_id is required', 400);
  const conditionField = String(body.condition_field || 'description');
  const conditionOperator = String(body.condition_operator || 'contains');
  const validFields = ['description', 'payee', 'reference', 'amount'];
  if (!validFields.includes(conditionField)) {
    return err('VALIDATION', `condition_field must be one of: ${validFields.join(', ')}`, 400);
  }
  const bankAccountIds = Array.isArray(body.bank_account_ids)
    ? (body.bank_account_ids as string[]).filter(Boolean)
    : null;

  const sb = supabaseAdmin();
  const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (!entityId) return err('CONFIG', 'No default entity for this tenant', 500);
  const { data: maxP } = await sb
    .from('acct_bank_rules')
    .select('priority')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('priority', { ascending: false })
    .limit(1);
  const priority = body.priority !== undefined
    ? Number(body.priority)
    : ((maxP?.[0]?.priority ?? 90) + 10);

  const { data: rule, error } = await sb
    .from('acct_bank_rules')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      name,
      priority,
      applies_to: (body.applies_to as string) || 'money_out',
      bank_account_ids: bankAccountIds,
      match_mode: (body.match_mode as string) || 'all',
      txn_type: (body.txn_type as string) || 'expense',
      memo: (body.memo as string) || null,
      auto_confirm: !!body.auto_confirm,
      is_active: body.is_active !== false,
    })
    .select('id, name, priority, applies_to, bank_account_ids, match_mode, txn_type, memo, auto_confirm, is_active, times_applied')
    .single();
  if (error) return err('VALIDATION', error.message, 400);

  const { error: condErr } = await sb.from('acct_bank_rule_conditions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    rule_id: rule.id,
    field: conditionField,
    operator: conditionOperator,
    value: conditionField === 'description' ? keyword.toUpperCase() : keyword,
    case_sensitive: false,
  });
  if (condErr) {
    await sb.from('acct_bank_rules').delete().eq('id', rule.id);
    return err('VALIDATION', condErr.message, 400);
  }
  const { error: splitErr } = await sb.from('acct_bank_rule_splits').insert({
    tenant_id: DEFAULT_TENANT_ID,
    rule_id: rule.id,
    line_no: 1,
    account_id: categoryAccountId,
    percent: 100,
  });
  if (splitErr) {
    await sb.from('acct_bank_rules').delete().eq('id', rule.id);
    return err('VALIDATION', splitErr.message, 400);
  }
  return NextResponse.json({
    data: shapeRule(rule, { field: conditionField, operator: conditionOperator, value: keyword }, { account_id: categoryAccountId }),
  }, { status: 201 });
}
