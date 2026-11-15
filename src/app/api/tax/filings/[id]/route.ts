import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/tax/filings/[id] — update a filing's status.
 *  Body: { status?, confirmation_number?, filed_at?, due_date?, is_correction? }
 *  Used by: file extension (status=extension_filed), transmit (status=transmitted),
 *  restart (status=draft), abandon (status=voided). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['status', 'confirmation_number', 'filed_at', 'due_date', 'is_correction', 'period_start', 'period_end', 'total_amount', 'record_count']) {
    if (f in body) updates[f] = body[f];
  }
  // Map UI status names → DB check-constraint values:
  //   transmitted → submitted, extension_filed → queued, voided → void
  const STATUS_MAP: Record<string, string> = {
    transmitted: 'submitted',
    extension_filed: 'queued',
    voided: 'void',
  };
  if (body.status) {
    updates.status = STATUS_MAP[body.status as string] || body.status;
  }
  // If transmitting, set filed_at + generate a confirmation number.
  if (body.status === 'transmitted') {
    updates.filed_at = new Date().toISOString();
    if (!updates.confirmation_number) {
      updates.confirmation_number = `CONF-${Date.now().toString(36).toUpperCase()}`;
    }
  }

  const { data, error } = await supabaseAdmin()
    .from('efile_filings')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Filing not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data });
}
