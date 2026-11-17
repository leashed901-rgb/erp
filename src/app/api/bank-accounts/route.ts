import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/bank-accounts — the tenant's bank accounts with their GL
 *  account name and current GL balance. Empty until a bank account is
 *  added — the tenant had none, which is also why receive-payment
 *  cannot record a deposit yet. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('id, name, institution_name, account_type, account_kind, masked_account_number, currency, gl_account_id, provider, is_active, opening_balance, opening_balance_date, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const glIds = [...new Set((data || []).map((a) => a.gl_account_id))];
  const { data: gl } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id, code, name')
    .in('id', glIds.length ? glIds : ['00000000-0000-0000-0000-000000000000']);
  const glById = new Map((gl || []).map((g) => [g.id, g]));
  const rows = [];
  for (const a of data || []) {
    const { data: bal } = await supabaseAdmin().rpc('acct_account_balance', {
      p_account_id: a.gl_account_id,
    });
    rows.push({
      ...a,
      gl_account_code: glById.get(a.gl_account_id)?.code,
      gl_account_name: glById.get(a.gl_account_id)?.name,
      balance: Number(bal ?? 0),
    });
  }
  return NextResponse.json({ data: rows, meta: { total: rows.length } });
}

/** POST /api/bank-accounts — add a bank account. gl_account_id (or
 *  chart_code, e.g. 1000) links it to the chart of accounts. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  if (!name) return err('VALIDATION', 'name is required', 400);
  let glAccountId = body.gl_account_id as string | undefined;
  if (!glAccountId && body.chart_code) {
    const { data } = await supabaseAdmin()
      .from('acct_chart_of_accounts')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('code', String(body.chart_code))
      .single();
    glAccountId = data?.id;
  }
  if (!glAccountId) return err('VALIDATION', 'gl_account_id (or chart_code) is required', 400);
  const { data: entityId } = await supabaseAdmin().rpc('acct_default_entity', {
    p_tenant_id: DEFAULT_TENANT_ID,
  });
  if (!entityId) return err('CONFIG', 'No default entity for this tenant', 500);

  const { data, error } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      name,
      institution_name: (body.institution_name as string) || null,
      account_type: (body.account_type as string) || 'checking',
      account_kind: (body.account_kind as string) || (body.account_type as string) || 'checking',
      masked_account_number: (body.masked_account_number as string) || null,
      currency: (body.currency as string) || 'USD',
      gl_account_id: glAccountId,
      opening_balance: Number(body.opening_balance || 0),
      opening_balance_date: (body.opening_balance_date as string) || null,
      is_active: true,
    })
    .select('id, name, institution_name, account_type, account_kind, masked_account_number, currency, gl_account_id, is_active, opening_balance')
    .single();
  if (error) {
    // One bank account per GL account (acct_bank_gl_unique) — say so
    // plainly instead of leaking the constraint name.
    if (error.message.includes('acct_bank_gl_unique')) {
      return err('VALIDATION', 'That GL account already has a bank account — pick a different GL account', 400);
    }
    return err('VALIDATION', error.message, 400);
  }
  return NextResponse.json({ data }, { status: 201 });
}
