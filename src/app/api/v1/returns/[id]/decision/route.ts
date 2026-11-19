import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/returns/[id]/decision — approve or decline a return
 * (doc 17, registry `rma.approve` / `rma.decline` → `erp_decide_return`).
 * Body: { decision: 'approve'|'decline', reason?, lines? }.
 * The old version updated the RMA row directly with columns that do not
 * exist on `erp_return_authorizations` (`decision_reason`, `decision_message`,
 * `decided_at`), so every decision 500'd — and it bypassed the RPC's
 * approve/decline guards (declines require a reason; approved quantities).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const decision = String(body.decision || '');
  if (!['approve', 'decline'].includes(decision)) {
    return err('VALIDATION', 'decision must be approve or decline', 400);
  }
  // erp_decide_return raises when a decline has no reason — validate here
  // so the screen gets a 400 with a usable message instead of a 500.
  if (decision === 'decline' && !String(body.reason || '').trim()) {
    return err('VALIDATION', 'A reason is required to decline a return', 400);
  }
  const { data: result, error } = await supabaseAdmin().rpc('erp_decide_return', {
    p_rma_id: id,
    p_approve: decision === 'approve',
    p_reason: (body.reason as string) || null,
    p_lines: (body.lines as unknown) ?? null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return NextResponse.json({ data, message: `Return ${result}` });
}
