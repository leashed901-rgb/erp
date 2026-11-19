import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { mapAccountType, mapSubtype } from '../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const SELECT =
  'id, code, name, account_type, subtype, description, currency, parent_account_id, is_control_account, is_reconcilable, is_posting_allowed, is_system, is_active, normal_balance, created_at, tax_category_id';

/** GET /api/accounts/[id] — one account with its derived balance. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select(SELECT)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !data) return err('NOT_FOUND', 'Account not found', 404);
  const { data: bal } = await supabaseAdmin().rpc('acct_account_balance', { p_account_id: id });
  return NextResponse.json({ data: { ...data, balance: Number(bal ?? 0), detail_type: data.subtype } });
}

/** PATCH /api/accounts/[id] — edit name/code/type/subtype/flags. The
 *  acct_coa_before_write trigger enforces the real rules: a posted
 *  account cannot move between balance sheet and P&L, cannot change
 *  company, cannot be deactivated with a balance or active children,
 *  and a system account cannot change type or be deactivated. Trigger
 *  errors surface as 400s with the trigger's own message. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.code !== undefined) updates.code = String(body.code || body.number || '').trim();
  if (body.account_type !== undefined || body.type !== undefined) {
    updates.account_type = mapAccountType(String(body.account_type || body.type));
  }
  if (body.subtype !== undefined || body.detailType !== undefined || body.detail !== undefined) {
    const type = (updates.account_type as string) || undefined;
    updates.subtype = mapSubtype(
      (body.subtype || body.detailType || body.detail) as string | undefined,
      type || 'expense',
    );
  }
  if (body.description !== undefined) updates.description = body.description as string | null;
  if (body.currency !== undefined) updates.currency = body.currency as string;
  if (body.parent_account_id !== undefined || body.parent !== undefined) {
    updates.parent_account_id = (body.parent_account_id as string) || (body.parent as string) || null;
  }
  if (body.is_control_account !== undefined) updates.is_control_account = !!body.is_control_account;
  if (body.is_reconcilable !== undefined) updates.is_reconcilable = !!body.is_reconcilable;
  if (body.is_posting_allowed !== undefined) updates.is_posting_allowed = !!body.is_posting_allowed;
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.tax_category_id !== undefined) {
    const catId = body.tax_category_id ? String(body.tax_category_id) : null;
    if (catId) {
      const { data: cat } = await supabaseAdmin()
        .from('acct_tax_categories')
        .select('id')
        .eq('id', catId)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .maybeSingle();
      if (!cat) return err('VALIDATION', 'Unknown tax category', 400);
    }
    updates.tax_category_id = catId;
  }

  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select(SELECT)
    .single();
  if (error) {
    const msg = /duplicate key|unique/i.test(error.message)
      ? `An account with code ${updates.code} already exists`
      : error.message;
    return err('VALIDATION', msg, 400);
  }
  const { data: bal } = await supabaseAdmin().rpc('acct_account_balance', { p_account_id: id });
  return NextResponse.json({ data: { ...data, balance: Number(bal ?? 0), detail_type: data.subtype } });
}

/** DELETE /api/accounts/[id] — delete. Refuses system accounts; the DB
 *  RESTRICT FKs refuse accounts with journal lines, children, or role
 *  mappings — those surface as 400s with the constraint message. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: row } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id, code, name, is_system')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!row) return err('NOT_FOUND', 'Account not found', 404);
  if (row.is_system) return err('VALIDATION', `System account ${row.code} ${row.name} cannot be deleted`, 400);
  const { error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: { id, deleted: true } });
}
