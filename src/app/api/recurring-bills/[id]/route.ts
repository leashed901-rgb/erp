import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-bills/[id] — one schedule (Batch I).
 * PATCH — name / frequency / next run date / auto_post / auto_pay /
 * is_active. DELETE — remove the schedule.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from('acct_recurring_bills').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !data) return err('NOT_FOUND', 'Recurring bill not found', 404);
  return NextResponse.json({
    data: {
      id: data.id,
      vendorId: data.vendor_id,
      name: data.name,
      frequency: data.frequency,
      intervalCount: data.interval_count,
      startDate: data.start_date,
      endDate: data.end_date,
      nextRunDate: data.next_run_date,
      autoPost: data.auto_post,
      autoPay: data.auto_pay,
      isActive: data.is_active,
      lines: data.lines,
      totalAmount: Number(data.total_amount || 0),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.frequency !== undefined) {
    if (!FREQUENCIES.includes(String(body.frequency))) return err('VALIDATION', `frequency must be one of ${FREQUENCIES.join(', ')}`, 400);
    patch.frequency = String(body.frequency);
  }
  if (body.intervalCount !== undefined) patch.interval_count = Number(body.intervalCount || 1);
  if (body.nextRunDate !== undefined) patch.next_run_date = String(body.nextRunDate).slice(0, 10);
  if (body.endDate !== undefined) patch.end_date = body.endDate ? String(body.endDate).slice(0, 10) : null;
  if (body.autoPost !== undefined) patch.auto_post = !!body.autoPost;
  if (body.autoPay !== undefined) patch.auto_pay = !!body.autoPay;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_recurring_bills').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Recurring bill not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, isActive: data.is_active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from('acct_recurring_bills').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
