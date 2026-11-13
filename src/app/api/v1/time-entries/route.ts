import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/acct/time/entries — list time entries. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  let query = supabaseAdmin()
    .from('acct_time_entries')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (q) query = query.ilike('name', '%' + q + '%');
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST — create a time entrie record. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = { ...body, tenant_id: DEFAULT_TENANT_ID };
  const { data, error } = await supabaseAdmin().from('acct_time_entries').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
