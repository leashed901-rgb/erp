import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/recognition/run — acct_run_recognition. Posts the journals
 * for every pending recognition line due on or before the date
 * (expense kinds Dr expense / Cr balance; revenue kinds Dr balance /
 * Cr revenue). Returns the engine's jsonb summary.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const asOf = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin().rpc('acct_run_recognition', { p_tenant_id: DEFAULT_TENANT_ID, p_as_of: asOf });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data });
}
