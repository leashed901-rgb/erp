import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/account-roles — the role → account map (Batch I,
 * read-only). Roles are the 45 engine roles (accounts_receivable,
 * undeposited_funds, inventory_asset, ...); acct_role_account resolves
 * them per entity. A role with no account assigned reads as "—".
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_account_roles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('role');
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as { account_id: string | null }[]).map((r) => r.account_id).filter(Boolean))] as string[];
  const { data: accounts } = accountIds.length
    ? await sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds)
    : { data: [] };
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      role: r.role,
      accountId: r.account_id,
      account: (accountById.get(r.account_id as string) as string) || '—',
    })),
  });
}
