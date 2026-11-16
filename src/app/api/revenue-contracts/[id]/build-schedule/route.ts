import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/revenue-contracts/[id]/build-schedule — build the
 * recognition schedule rows for one obligation (Batch H). The engine
 * has no builder for contract schedules, so the route builds them
 * from the obligation's own method and window:
 * - straight_line: one row per accounting period in the window,
 *   allocated / months (the last row takes the rounding remainder).
 * - point_in_time: one row for the full allocated price in the period
 *   containing recognition_end.
 * - milestone / usage / percentage_complete / manual: the schedule is
 *   event-driven, so no rows are invented — 400 with the reason.
 * Existing rows for the obligation are replaced (the schedule is a
 * plan, not a ledger — recognized rows block a rebuild).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const obligationId = String(body.obligationId || '');
  if (!obligationId) return err('VALIDATION', 'obligationId is required', 400);
  const { data: ob, error: obErr } = await supabaseAdmin().from('acct_revenue_performance_obligations').select('*').eq('contract_id', id).eq('id', obligationId).single();
  if (obErr || !ob) return err('NOT_FOUND', 'Obligation not found on this contract', 404);
  const o = ob as Record<string, unknown>;
  const method = String(o.recognition_method);
  if (!['straight_line', 'point_in_time'].includes(method)) {
    return err('UNSUPPORTED', `Schedules for ${method} obligations are event-driven and are not built here`, 400);
  }
  const start = String(o.recognition_start || '').slice(0, 10);
  const end = String(o.recognition_end || '').slice(0, 10);
  if (!start || !end) return err('VALIDATION', 'The obligation needs a recognition start and end to build a schedule', 400);
  if (end < start) return err('VALIDATION', 'Recognition end must be after start', 400);
  const { data: existing } = await supabaseAdmin().from('acct_revenue_recognition_schedules').select('id, recognized_amount').eq('obligation_id', obligationId);
  if ((existing ?? []).some((r) => Number((r as Record<string, unknown>).recognized_amount || 0) > 0)) {
    return err('VALIDATION', 'This obligation already has recognized amounts — the schedule cannot be rebuilt', 400);
  }
  const { data: periods, error: perErr } = await supabaseAdmin().from('acct_periods').select('id, start_date, end_date').eq('tenant_id', DEFAULT_TENANT_ID).lte('start_date', end).gte('end_date', start).order('start_date');
  if (perErr) return err('INTERNAL', perErr.message, 500);
  const allocated = Number(o.allocated_price || 0);
  type Row = { obligation_id: string; period_id: string | null; scheduled_amount: number; recognized_amount: number; status: string };
  let rows: Row[] = [];
  if (method === 'point_in_time') {
    const period = ((periods ?? []) as Record<string, unknown>[]).find((p) => String(p.start_date) <= end && String(p.end_date) >= end);
    if (!period) return err('VALIDATION', `No accounting period covers ${end}`, 400);
    rows = [{ obligation_id: obligationId, period_id: period.id as string, scheduled_amount: allocated, recognized_amount: 0, status: 'scheduled' }];
  } else {
    const ps = (periods ?? []) as Record<string, unknown>[];
    if (ps.length === 0) return err('VALIDATION', `No accounting periods cover ${start} to ${end}`, 400);
    const per = Math.floor((allocated / ps.length) * 100) / 100;
    rows = ps.map((p, i) => ({
      obligation_id: obligationId,
      period_id: p.id as string,
      scheduled_amount: i === ps.length - 1 ? Math.round((allocated - per * (ps.length - 1)) * 100) / 100 : per,
      recognized_amount: 0,
      status: 'scheduled',
    }));
  }
  if (existing && existing.length) {
    const { error: delErr } = await supabaseAdmin().from('acct_revenue_recognition_schedules').delete().eq('obligation_id', obligationId);
    if (delErr) return err('DB_ERROR', delErr.message, 400);
  }
  const { data: inserted, error: insErr } = await supabaseAdmin().from('acct_revenue_recognition_schedules').insert(rows).select('id');
  if (insErr) return err('DB_ERROR', insErr.message, 400);
  return NextResponse.json({ data: { rows: (inserted ?? []).length } }, { status: 201 });
}
