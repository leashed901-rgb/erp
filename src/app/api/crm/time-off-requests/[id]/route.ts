import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toTimeOffRequest } from '@/lib/timeTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** PATCH /api/crm/time-off-requests/[id] — time-off approvals (doc 13
 *  gap): approve / deny with reviewer + note. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const decision = body.decision ? String(body.decision) : '';
  if (!['approved', 'denied'].includes(decision)) return err('VALIDATION', 'decision must be approved or denied', 400);
  const { data, error } = await supabaseAdmin()
    .from('crm_time_off_requests')
    .update({
      status: decision,
      reviewed_by: body.reviewedBy ? String(body.reviewedBy) : null,
      reviewed_at: new Date().toISOString(),
      review_note: body.reviewNote ? String(body.reviewNote) : null,
    })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toTimeOffRequest(data as Record<string, unknown>) });
}
