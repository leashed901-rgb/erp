import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shipmentIdsForOrder } from '../[id]/labels/route';

/* Batch slips & labels (doc 14: fulfillment.print_slip →
   commerce_batch_slips; POST /orders/batch-labels gap route). A batch
   slip is a print document row in the schema (batch_number, status,
   document_uri) — it carries no order list; labels attach per
   shipment, so orders without a shipment yet are reported skipped. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderIds = Array.isArray(body.orderIds) ? (body.orderIds as string[]) : [];
  if (!orderIds.length) return err('VALIDATION', 'orderIds is required', 400);
  const sb = supabaseAdmin();

  const batchNumber = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const { data: slip, error: slipErr } = await sb
    .from('commerce_batch_slips')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      batch_number: batchNumber,
      status: 'open',
      printed_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (slipErr) return err('INTERNAL', slipErr.message, 500);

  let labelCount = 0;
  let skipped = 0;
  if (body.includeLabels !== false) {
    for (const orderId of orderIds) {
      const shipmentIds = await shipmentIdsForOrder(sb, orderId);
      if (!shipmentIds.length) { skipped++; continue; }
      const { error: labErr } = await sb.from('commerce_shipping_labels').insert({
        tenant_id: DEFAULT_TENANT_ID,
        shipment_id: shipmentIds[0],
        label_type: 'shipping',
        carrier: typeof body.carrier === 'string' ? body.carrier : null,
        printed_at: new Date().toISOString(),
      });
      if (!labErr) labelCount++;
    }
  }

  return NextResponse.json({
    data: {
      slip: {
        id: String(slip.id),
        batchNumber: String(slip.batch_number),
        orderCount: orderIds.length,
        status: (slip.status as string) || null,
        createdAt: String(slip.created_at || ''),
      },
      labelCount,
      skipped,
    },
  }, { status: 201 });
}

/** GET — batch slips list for the Batch slips screen. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('commerce_batch_slips')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: (data || []).map((r) => ({
      id: String(r.id),
      batchNumber: String(r.batch_number),
      orderCount: 0,
      status: (r.status as string) || null,
      createdAt: String(r.created_at || ''),
    })),
  });
}
