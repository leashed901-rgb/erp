import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/purchase-orders/[id]/create-bill — registry
 *  po.create_bill → acct_bill_from_purchase_order RPC (3-way match). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* fields optional */ }
  const { data, error } = await supabaseAdmin().rpc('acct_bill_from_purchase_order', {
    p_po_id: id,
    p_bill_number: body.billNumber ? String(body.billNumber) : null,
    p_bill_date: body.billDate ? String(body.billDate) : new Date().toISOString().slice(0, 10),
    p_basis: body.basis ? String(body.basis) : 'received',
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
