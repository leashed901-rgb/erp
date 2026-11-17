import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/cycle-counts/[id]/post — post a submitted count
 * (doc 16, registry `inventory.post_count` → `acct_post_erp_count_session`).
 * The RPC posts the counted-vs-on-hand variance to the ledger as inventory
 * adjustments. It raises when no counted line links to an `acct_items`
 * inventory item — the tenant has no acct_items rows, so posting is blocked
 * on that master data until finance items are provisioned; the error is
 * surfaced verbatim rather than papered over.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: session } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('id,status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!session) return err('NOT_FOUND', 'Count session not found', 404);
  if (session.status !== 'submitted') {
    return err('VALIDATION', `Count is ${session.status} — submit it before posting`, 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_post_erp_count_session', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_session_id: id,
  });
  if (error) return err('INTERNAL', error.message, 500);
  await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', id);
  // The RPC returns SETOF record but never RETURNs rows (it PERFORMs the
  // inner posting function) — the route's `data` was always []. Report
  // what the post actually did: the 'count' moves it wrote, referenced
  // 'COUNT <session id>' by the engine.
  const { data: moves } = await supabaseAdmin()
    .from('acct_inventory_moves')
    .select('id,item_id,quantity,unit_cost,total_cost,move_date')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('reference', `COUNT ${id}`);
  return NextResponse.json({ data: moves ?? [] });
}
