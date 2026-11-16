import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Account dimension rules (Batch I). A rule says: postings to this
 * account must (or may) carry this dimension, optionally restricted to
 * an allowed set of value codes. GET ?accountId= filters. POST —
 * create; one rule per (account, dimension) — a second insert for the
 * same pair is a 400, not a silent duplicate. DELETE ?id=.
 */
export async function GET(req: NextRequest) {
  const accountId = new URL(req.url).searchParams.get('accountId');
  const sb = supabaseAdmin();
  let query = sb.from('acct_account_dimension_rules').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('account_id');
  if (accountId) query = query.eq('account_id', accountId);
  const { data, error } = await query.limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as { account_id: string }[]).map((r) => r.account_id))];
  const dimensionIds = [...new Set(((data ?? []) as { dimension_id: string }[]).map((r) => r.dimension_id))];
  const [{ data: accounts }, { data: dims }] = await Promise.all([
    accountIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
    dimensionIds.length ? sb.from('acct_dimensions').select('id, code, name').in('id', dimensionIds) : Promise.resolve({ data: [] }),
  ]);
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, a]));
  const dimById = new Map(((dims ?? []) as Record<string, unknown>[]).map((d) => [d.id, d]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const a = accountById.get(r.account_id as string) as Record<string, unknown> | undefined;
      const d = dimById.get(r.dimension_id as string) as Record<string, unknown> | undefined;
      return {
        id: r.id,
        accountId: r.account_id,
        account: a ? `${a.code} · ${a.name}` : '—',
        dimensionId: r.dimension_id,
        dimension: d ? `${d.code} — ${d.name}` : '—',
        isRequired: r.is_required,
        allowedValues: r.allowed_values ?? null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || '');
  const dimensionId = String(body.dimensionId || '');
  if (!accountId) return err('VALIDATION', 'accountId is required', 400);
  if (!dimensionId) return err('VALIDATION', 'dimensionId is required', 400);
  const allowedValues = Array.isArray(body.allowedValues) ? body.allowedValues : null;
  const sb = supabaseAdmin();
  const [{ data: account }, { data: dim }, { data: existing }] = await Promise.all([
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', accountId).single(),
    sb.from('acct_dimensions').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', dimensionId).single(),
    sb.from('acct_account_dimension_rules').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('account_id', accountId).eq('dimension_id', dimensionId).maybeSingle(),
  ]);
  if (!account) return err('VALIDATION', 'Unknown account', 400);
  if (!dim) return err('VALIDATION', 'Unknown dimension', 400);
  if (existing) return err('VALIDATION', 'A rule already exists for this account and dimension — delete it first', 400);
  const { data, error } = await sb.from('acct_account_dimension_rules').insert({
    tenant_id: DEFAULT_TENANT_ID,
    account_id: accountId,
    dimension_id: dimensionId,
    is_required: !!body.isRequired,
    allowed_values: allowedValues,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, accountId: data.account_id, dimensionId: data.dimension_id, isRequired: data.is_required, allowedValues: data.allowed_values ?? null } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_account_dimension_rules').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
