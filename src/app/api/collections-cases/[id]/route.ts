import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const STATUSES = ['open', 'in_progress', 'promised', 'escalated', 'written_off', 'settled', 'closed'];

/**
 * PATCH /api/collections-cases/[id] — work a collections case.
 * Body: { status?, priority?, nextActionAt?, notes?, disputeAmount?, reason? }.
 * status must be one of the engine's values.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const patch: Record<string, unknown> = {};
  if (body.status != null) {
    if (!STATUSES.includes(String(body.status))) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
    patch.status = String(body.status);
  }
  if (body.priority != null) patch.priority = String(body.priority);
  if (body.nextActionAt !== undefined) patch.next_action_at = body.nextActionAt ? String(body.nextActionAt) : null;
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
  if (body.disputeAmount != null) patch.dispute_amount = Number(body.disputeAmount);
  if (body.reason !== undefined) patch.reason = body.reason ? String(body.reason) : null;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('acct_ar_collections_cases')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Collections case not found', 404);
  return NextResponse.json({ data: { id: data.id, status: data.status, priority: data.priority } });
}
