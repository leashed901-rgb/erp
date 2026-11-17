import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { OrderPayment } from '@/lib/arApLinkTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * GET /api/orders/[id]/payments — payments recorded against an erp order
 * (acct_order_payments). Read-only: the writes come from the order flows.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_order_payments')
    .select('*')
    .eq('order_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const rows: OrderPayment[] = (data || []).map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id || ''),
    kind: String(r.kind || ''),
    amount: Number(r.amount || 0),
    fee: Number(r.fee || 0),
    processor: (r.processor as string) || null,
    processorRef: (r.processor_ref as string) || null,
    journalEntryId: (r.journal_entry_id as string) || null,
    createdAt: String(r.created_at || ''),
  }));
  return NextResponse.json({ data: rows });
}
