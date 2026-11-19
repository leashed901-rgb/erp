import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRule } from '../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** PATCH /api/bank-rules/[id] — rename, pause/resume, reprioritize,
 *  change the keyword or the category account. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('acct_bank_rules')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!existing) return err('NOT_FOUND', 'Bank rule not found', 404);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.priority !== undefined) updates.priority = Number(body.priority);
  if (body.applies_to !== undefined) updates.applies_to = body.applies_to;
  if (body.match_mode !== undefined) updates.match_mode = body.match_mode;
  if (body.txn_type !== undefined) updates.txn_type = body.txn_type;
  if (body.memo !== undefined) updates.memo = body.memo as string | null;
  if (body.auto_confirm !== undefined) updates.auto_confirm = !!body.auto_confirm;
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.bank_account_ids !== undefined) {
    updates.bank_account_ids = Array.isArray(body.bank_account_ids)
      ? (body.bank_account_ids as string[]).filter(Boolean)
      : null;
  }
  if (Object.keys(updates).length > 1) {
    const { error } = await sb
      .from('acct_bank_rules')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
    if (error) return err('VALIDATION', error.message, 400);
  }
  if (body.condition_keyword !== undefined || body.condition_field !== undefined || body.condition_operator !== undefined) {
    const { data: cond } = await sb
      .from('acct_bank_rule_conditions')
      .select('id, field, operator, value')
      .eq('rule_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(1);
    const field = String(body.condition_field || cond?.[0]?.field || 'description');
    const operator = String(body.condition_operator || cond?.[0]?.operator || 'contains');
    const value = body.condition_keyword !== undefined
      ? (field === 'description' ? String(body.condition_keyword).trim().toUpperCase() : String(body.condition_keyword).trim())
      : String(cond?.[0]?.value || '');
    if (cond?.[0]) {
      await sb.from('acct_bank_rule_conditions').update({ field, operator, value }).eq('id', cond[0].id);
    } else {
      await sb.from('acct_bank_rule_conditions').insert({
        tenant_id: DEFAULT_TENANT_ID,
        rule_id: id,
        field,
        operator,
        value,
        case_sensitive: false,
      });
    }
  }
  if (body.category_account_id !== undefined) {
    const { data: split } = await sb
      .from('acct_bank_rule_splits')
      .select('id')
      .eq('rule_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('line_no', { ascending: true })
      .limit(1);
    if (split?.[0]) {
      await sb.from('acct_bank_rule_splits').update({ account_id: body.category_account_id }).eq('id', split[0].id);
    } else {
      await sb.from('acct_bank_rule_splits').insert({
        tenant_id: DEFAULT_TENANT_ID,
        rule_id: id,
        line_no: 1,
        account_id: body.category_account_id,
        percent: 100,
      });
    }
  }
  const { data: rule } = await sb
    .from('acct_bank_rules')
    .select('id, name, priority, applies_to, bank_account_ids, match_mode, txn_type, memo, auto_confirm, is_active, times_applied, last_applied_at')
    .eq('id', id)
    .single();
  const { data: conds } = await sb.from('acct_bank_rule_conditions').select('field, operator, value').eq('rule_id', id).limit(1);
  const { data: splits } = await sb.from('acct_bank_rule_splits').select('account_id').eq('rule_id', id).order('line_no').limit(1);
  return NextResponse.json({ data: shapeRule(rule || { id }, conds?.[0], splits?.[0]) });
}

/** DELETE /api/bank-rules/[id] — delete the rule and its conditions
 *  and splits. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('acct_bank_rules')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!existing) return err('NOT_FOUND', 'Bank rule not found', 404);
  await sb.from('acct_bank_rule_conditions').delete().eq('rule_id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  await sb.from('acct_bank_rule_splits').delete().eq('rule_id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  const { error } = await sb.from('acct_bank_rules').delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
