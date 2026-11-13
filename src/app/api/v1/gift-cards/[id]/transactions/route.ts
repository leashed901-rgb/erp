import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/gift-cards/[id]/transactions — gift card ledger. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('commerce_gift_card_transactions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('gift_card_id', id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/v1/gift-cards/[id]/transactions — issue, redeem, reload, adjust. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    gift_card_id: id,
    transaction_type: String(body.transaction_type || 'redeem'),
    amount: Number(body.amount) || 0,
    reference: body.reference || null,
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('commerce_gift_card_transactions').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
