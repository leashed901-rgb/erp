import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/orders/[id]/notes — registry fulfillment.add_note →
 *  erp_add_order_note RPC. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.body) return err('VALIDATION', 'body is required', 400);
  const { data, error } = await supabaseAdmin().rpc('erp_add_order_note', {
    p_order_id: id,
    p_body: String(body.body),
    p_note_type: body.noteType ? String(body.noteType) : 'internal',
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
