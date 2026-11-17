import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/flux/explain — write (or replace) the explanation for an
 * account's flux in a window (Batch G). The engine upserts on
 * (tenant, account, period_start, period_end), so re-explaining the
 * same window replaces the text instead of duplicating it.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const accountId = String(body.accountId || '');
  const from = String(body.from || '');
  const to = String(body.to || '');
  const explanation = String(body.explanation || '').trim();
  if (!accountId || !DATE_RE.test(from) || !DATE_RE.test(to) || !explanation) {
    return err('VALIDATION', 'accountId, from, to and a non-empty explanation are required', 400);
  }
  const { data: account } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return err('NOT_FOUND', 'Account not found', 404);
  const { data, error } = await supabaseAdmin().rpc('acct_explain_flux', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_account_id: accountId,
    p_from: from,
    p_to: to,
    p_explanation: explanation,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
