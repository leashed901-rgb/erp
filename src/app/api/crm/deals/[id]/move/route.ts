import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * POST /api/crm/deals/[id]/move — move a deal to a stage (registered
 * action `deal.move`; the kanban drag endpoint).
 *
 * The platform RPC crm_move_deal is member-guarded
 * (platform_is_tenant_member on auth.uid), which a service-role call
 * can never satisfy — same wall as crm_convert_lead. This route
 * performs the RPC's exact write: validate the stage, require a lost
 * reason for lost stages, and UPDATE stage_id/lost_reason. The
 * crm_deal_stage_history row and the status/probability sync are
 * written by the table's own triggers (trg_crm_deal_history,
 * trg_crm_deal_stage), which fire on this update exactly as they do
 * inside the RPC.
 * Body: { stage_id, lost_reason? }. Returns the updated deal.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('VALIDATION', 'Invalid JSON body', 400);
  }
  const stageId = body.stage_id ? String(body.stage_id) : '';
  if (!stageId) return fail('VALIDATION', 'stage_id is required', 400);
  const lostReason = body.lost_reason ? String(body.lost_reason) : null;

  const db = supabaseAdmin();
  const { data: stage, error: stageError } = await db
    .from('crm_pipeline_stages')
    .select('id, stage_kind')
    .eq('id', stageId)
    .maybeSingle();
  if (stageError) return fail('INTERNAL', stageError.message, 500);
  if (!stage) return fail('NOT_FOUND', 'Stage not found', 404);
  if (stage.stage_kind === 'lost' && !lostReason?.trim()) {
    return fail('VALIDATION', 'a lost reason is required', 400);
  }

  const { data, error } = await db
    .from('crm_deals')
    .update({
      stage_id: stageId,
      lost_reason: stage.stage_kind === 'lost' ? lostReason : null,
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
