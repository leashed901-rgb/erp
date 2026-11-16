import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toTimesheet } from '../route';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** PATCH /api/payroll/timesheets/[id] — approve or void a payroll time entry. Body: { status: 'approved' | 'void' } (the table's status CHECK allows open|approved|invoiced|void only). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (body.status !== 'approved' && body.status !== 'void') {
    return err('VALIDATION', "status must be 'approved' or 'void'", 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_time_entries')
    .update({ status: String(body.status) })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('billable', false)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toTimesheet(data) });
}

/** DELETE /api/payroll/timesheets/[id] — delete an open payroll time entry (approved/invoiced entries are records; delete refuses them). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: row } = await sb.from('acct_time_entries').select('status').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).eq('billable', false).maybeSingle();
  if (!row) return err('NOT_FOUND', 'Timesheet not found', 404);
  if (row.status === 'approved' || row.status === 'invoiced') return err('VALIDATION', 'Approved or invoiced entries cannot be deleted', 400);
  const { error } = await sb.from('acct_time_entries').delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).eq('billable', false);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true, id } });
}
