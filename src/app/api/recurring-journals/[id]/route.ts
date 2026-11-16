import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-journals/[id] — one template (Batch I).
 * PATCH — name / frequency / next run date / template / active.
 * DELETE — remove the template. No runner exists for these, so there
 * is nothing to stop or unwind.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from('acct_recurring_journals').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !data) return err('NOT_FOUND', 'Recurring journal not found', 404);
  return NextResponse.json({
    data: {
      id: data.id,
      bookId: data.book_id,
      name: data.name,
      frequency: data.frequency,
      intervalN: data.interval_n,
      nextRunDate: data.next_run_date,
      active: data.active,
      template: data.template,
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
  if (body.intervalN !== undefined) patch.interval_n = Number(body.intervalN || 1);
  if (body.nextRunDate !== undefined) patch.next_run_date = String(body.nextRunDate).slice(0, 10);
  if (body.active !== undefined) patch.active = !!body.active;
  if (body.template !== undefined) {
    const template = Array.isArray(body.template) ? body.template : [];
    if (template.length < 2) return err('VALIDATION', 'A journal template needs at least two lines', 400);
    const parsed = template.map((l: Record<string, unknown>) => ({
      account_id: String(l.accountId || l.account_id || ''),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: String(l.description || ''),
    }));
    if (parsed.some((l: { account_id: string }) => !l.account_id)) return err('VALIDATION', 'Every template line needs an account', 400);
    const debits = parsed.reduce((s: number, l: { debit: number }) => s + l.debit, 0);
    const credits = parsed.reduce((s: number, l: { credit: number }) => s + l.credit, 0);
    if (Math.abs(debits - credits) > 0.005) return err('VALIDATION', 'Template lines must balance (debits = credits)', 400);
    patch.template = parsed;
  }
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_recurring_journals').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Recurring journal not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, active: data.active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from('acct_recurring_journals').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
