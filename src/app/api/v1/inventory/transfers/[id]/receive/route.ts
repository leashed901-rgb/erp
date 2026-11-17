import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/transfers/[id]/receive — receive an in-transit
 * transfer (`erp_receive_transfer`). The RPC moves the remaining shipped
 * quantity into the destination warehouse and marks the transfer received.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().rpc('erp_receive_transfer', { p_transfer_id: id });
  if (error) return err('INTERNAL', error.message, 500);
  const { data } = await supabaseAdmin()
    .from('erp_inventory_transfers')
    .select('id,transfer_number,status,received_at')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return NextResponse.json({ data });
}
