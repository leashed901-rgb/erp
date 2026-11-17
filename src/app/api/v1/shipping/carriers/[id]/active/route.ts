import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/shipping/carriers/[id]/active — registry
 *  carrier.disable / enable → erp_set_carrier_active RPC. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const { data, error } = await supabaseAdmin().rpc('erp_set_carrier_active', {
    p_carrier_id: id,
    p_active: Boolean(body.active),
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
