import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-invoices/[id] — schedule + child lines (Batch I).
 * PATCH — name / frequency / next run date / status. Only 'active'
 * schedules are picked up by the runner. DELETE — removes the child
 * lines first, then the schedule.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: schedule, error }, { data: lines }] = await Promise.all([
    sb.from('acct_recurring_invoices').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_recurring_invoice_lines').select('*').eq('recurring_invoice_id', id).order('line_number'),
  ]);
  if (error || !schedule) return err('NOT_FOUND', 'Recurring invoice not found', 404);
  // Lines live in the parent jsonb (see route.ts header: the engine's
  // child path cannot post). Fall back to it when the child table is
  // empty, e.g. schedules created through this API.
  const jsonbLines = Array.isArray(schedule.lines) ? (schedule.lines as Record<string, unknown>[]) : [];
  const shown = (lines ?? []).length ? (lines as Record<string, unknown>[]) : jsonbLines.map((l, i) => ({
    id: `jsonb-${i}`,
    line_number: i + 1,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    tax_amount: l.tax_amount,
    line_total: l.line_total,
  }));
  return NextResponse.json({
    data: {
      id: schedule.id,
      customerId: schedule.customer_id,
      templateNumber: schedule.template_number,
      name: schedule.name,
      frequency: schedule.frequency,
      intervalCount: schedule.interval_count,
      nextRunDate: schedule.next_run_date,
      currency: schedule.currency,
      subtotal: Number(schedule.subtotal || 0),
      totalAmount: Number(schedule.total || 0),
      status: schedule.status,
      lines: shown.map((l) => ({
        id: l.id,
        lineNumber: l.line_number,
        description: l.description,
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price || 0),
        taxAmount: Number(l.tax_amount || 0),
        lineTotal: Number(l.line_total || 0),
      })),
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
  if (body.status !== undefined) patch.status = String(body.status);
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_recurring_invoices').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Recurring invoice not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, status: data.status } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: schedule } = await sb.from('acct_recurring_invoices').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!schedule) return err('NOT_FOUND', 'Recurring invoice not found', 404);
  await sb.from('acct_recurring_invoice_lines').delete().eq('recurring_invoice_id', id);
  const { error } = await sb.from('acct_recurring_invoices').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
