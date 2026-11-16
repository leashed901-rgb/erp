import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/tax/efile-filings/[id]/queue — transmit a filing via efile_queue. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: filing } = await sb
    .from('efile_filings')
    .select('id,status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (!filing) return err('NOT_FOUND', 'Filing not found', 404);
  const { data, error } = await sb.rpc('efile_queue', { p_filing_id: id });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: after } = await sb.from('efile_filings').select('*').eq('id', id).single();
  return NextResponse.json({ data: { rpc: data, filing: after } });
}

/** DELETE /api/tax/efile-filings/[id]/queue — discard a draft filing. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('efile_filings')
    .update({ status: 'discarded' })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'draft')
    .select('id,status')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('CONFLICT', 'Only a draft filing can be discarded', 409);
  return NextResponse.json({ data });
}
