import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/recognition/tieout — acct_recognition_tieout. The engine's
 * own reconciliation of the recognition schedules against the books
 * as of a date (Batch H).
 */
export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get('asOf') || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin().rpc('acct_recognition_tieout', { p_tenant_id: DEFAULT_TENANT_ID, p_as_of: asOf });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data });
}
