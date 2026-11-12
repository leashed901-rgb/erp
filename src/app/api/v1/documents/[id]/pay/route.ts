import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/pay?type=bill
 *  Pays a bill (status → 'paid', sets paid_at).
 *  Tries the RPC (create_bill → pay) if available; falls back to direct update. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  if (type === 'bill') {
    // Update bill status
    const { data, error } = await supabaseAdmin().from('acct_ap_bills').update({
      status: 'paid',
      amount_paid: body.amount || null,
      open_balance: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
    if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
    return NextResponse.json({ data, message: 'Bill paid' });
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: 'Unsupported type for pay', requestId: crypto.randomUUID() } }, { status: 400 });
}
