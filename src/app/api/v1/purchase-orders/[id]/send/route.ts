import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/purchase-orders/[id]/send — registry po.send →
 *  erp_send_purchase_order RPC. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* fields optional */ }
  const { data, error } = await supabaseAdmin().rpc('erp_send_purchase_order', {
    p_po_id: id,
    p_to: body.to ? String(body.to) : null,
    p_message: body.message ? String(body.message) : null,
    p_document_url: body.documentUrl ? String(body.documentUrl) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
