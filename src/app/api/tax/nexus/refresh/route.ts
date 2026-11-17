import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/tax/nexus/refresh — recompute nexus exposure + alerts. */
export async function POST() {
  const sb = supabaseAdmin();
  const { error } = await sb.rpc('tax_refresh_nexus_alerts', { p_tenant_id: DEFAULT_TENANT_ID });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: exposure, error: expErr } = await sb.rpc('tax_nexus_exposure', { p_tenant_id: DEFAULT_TENANT_ID });
  if (expErr) return err('INTERNAL', expErr.message, 500);
  return NextResponse.json({ data: { exposure } });
}
