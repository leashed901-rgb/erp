import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/reconciliations — list reconciliations. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');
  let q = supabaseAdmin()
    .from('acct_reconciliations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(50);
  if (accountId) q = q.eq('bank_account_id', accountId);
  const { data, error } = await q;
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/reconciliations — start a reconciliation.
 *  Wraps acct_start_reconciliation RPC. Fallback: insert a row directly.
 *  Body: { bank_account_id, statement_ending_balance, statement_ending_date, service_charge?, interest_earned? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const bankAccountId = body.bank_account_id as string | undefined;
  const endingBalance = Number(body.statement_ending_balance);
  if (!bankAccountId || !Number.isFinite(endingBalance)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'bank_account_id and statement_ending_balance are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_start_reconciliation', {
    bank_account_uuid: bankAccountId,
    tenant_uuid: DEFAULT_TENANT_ID,
    ending_balance: endingBalance,
    ending_date: (body.statement_ending_date as string | undefined) || null,
  });
  if (!rpcErr && rpcData) {
    const row = rpcData as { id?: string };
    return NextResponse.json({ data: { started: true, reconciliation_id: row.id || null, source: 'rpc' } });
  }

  // 2. Fallback: insert a reconciliation row.
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    bank_account_id: bankAccountId,
    statement_ending_balance: endingBalance,
    statement_ending_date: body.statement_ending_date || null,
    service_charge: Number(body.service_charge) || 0,
    interest_earned: Number(body.interest_earned) || 0,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from('acct_reconciliations')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { started: true, reconciliation: data, source: 'fallback' } }, { status: 201 });
}
