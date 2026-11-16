import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/v1/documents/[id]/collections-case — open a collections case
 * on an invoice (acct_ar_collections_cases). There is no engine RPC for
 * this; the case is a direct record. Body: { priority?, reason?, notes?,
 * nextActionAt?, disputeAmount?, assignedTo? }.
 * priority defaults to 'medium'; status starts 'open'.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const sb = supabaseAdmin();
  const { data: inv } = await sb.from('acct_ar_invoices').select('id,customer_id,invoice_number').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!inv) return err('NOT_FOUND', 'Invoice not found', 404);
  const priority = String(body.priority || 'medium');
  if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
    return err('VALIDATION', 'priority must be low, medium, high or urgent', 400);
  }
  const { data, error } = await sb.from('acct_ar_collections_cases').insert({
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: inv.customer_id,
    invoice_id: id,
    priority,
    status: 'open',
    assigned_to: body.assignedTo ? String(body.assignedTo) : null,
    next_action_at: body.nextActionAt ? String(body.nextActionAt) : null,
    dispute_amount: body.disputeAmount != null ? Number(body.disputeAmount) : 0,
    reason: body.reason ? String(body.reason) : null,
    notes: body.notes ? String(body.notes) : null,
  }).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, status: 'open', invoiceNumber: inv.invoice_number } }, { status: 201 });
}
