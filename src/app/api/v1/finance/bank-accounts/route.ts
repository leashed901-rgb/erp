import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/finance/bank-accounts — the tenant's real bank accounts
 *  (acct_bank_accounts) with their linked CoA code/name for display.
 *  The payment modal's "Deposit to" picker reads this, never seed data. */
export async function GET() {
  const { data: accounts, error } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('id,name,account_kind,account_type,gl_account_id,is_active,opening_balance')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name');
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  const glIds = [...new Set((accounts ?? []).map((a) => a.gl_account_id).filter(Boolean))];
  let glById = new Map<string, { code: string; name: string }>();
  if (glIds.length > 0) {
    const { data: gl } = await supabaseAdmin().from('acct_chart_of_accounts').select('id,code,name').in('id', glIds);
    glById = new Map((gl ?? []).map((g) => [g.id as string, { code: g.code as string, name: g.name as string }]));
  }
  return NextResponse.json({
    data: (accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      account_kind: a.account_kind,
      gl_account_id: a.gl_account_id,
      gl_code: a.gl_account_id ? glById.get(a.gl_account_id as string)?.code ?? null : null,
      gl_name: a.gl_account_id ? glById.get(a.gl_account_id as string)?.name ?? null : null,
      is_active: a.is_active,
    })),
  });
}
