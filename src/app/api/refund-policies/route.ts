import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Refund policies (Batch I). GET — all policies. POST — create
 * (window_days + fee + approval thresholds). PATCH ?id= — edit.
 * DELETE ?id=.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_refund_policies').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      windowDays: p.window_days,
      restockingFeePercent: p.restocking_fee_percent == null ? null : Number(p.restocking_fee_percent),
      requireApprovalAbove: p.require_approval_above == null ? null : Number(p.require_approval_above),
      autoApproveBelow: p.auto_approve_below == null ? null : Number(p.auto_approve_below),
      notes: p.notes,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin().from('acct_refund_policies').insert({
    tenant_id: DEFAULT_TENANT_ID,
    window_days: body.windowDays == null ? null : Number(body.windowDays),
    restocking_fee_percent: body.restockingFeePercent == null ? null : Number(body.restockingFeePercent),
    require_approval_above: body.requireApprovalAbove == null ? null : Number(body.requireApprovalAbove),
    auto_approve_below: body.autoApproveBelow == null ? null : Number(body.autoApproveBelow),
    notes: body.notes ? String(body.notes) : null,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, windowDays: data.window_days, restockingFeePercent: data.restocking_fee_percent == null ? null : Number(data.restocking_fee_percent), requireApprovalAbove: data.require_approval_above == null ? null : Number(data.require_approval_above), autoApproveBelow: data.auto_approve_below == null ? null : Number(data.auto_approve_below), notes: data.notes } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.windowDays !== undefined) patch.window_days = body.windowDays == null ? null : Number(body.windowDays);
  if (body.restockingFeePercent !== undefined) patch.restocking_fee_percent = body.restockingFeePercent == null ? null : Number(body.restockingFeePercent);
  if (body.requireApprovalAbove !== undefined) patch.require_approval_above = body.requireApprovalAbove == null ? null : Number(body.requireApprovalAbove);
  if (body.autoApproveBelow !== undefined) patch.auto_approve_below = body.autoApproveBelow == null ? null : Number(body.autoApproveBelow);
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  const { data, error } = await supabaseAdmin().from('acct_refund_policies').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Refund policy not found', 404);
  return NextResponse.json({ data: { id: data.id, windowDays: data.window_days, restockingFeePercent: data.restocking_fee_percent == null ? null : Number(data.restocking_fee_percent), requireApprovalAbove: data.require_approval_above == null ? null : Number(data.require_approval_above), autoApproveBelow: data.auto_approve_below == null ? null : Number(data.auto_approve_below), notes: data.notes } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_refund_policies').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
