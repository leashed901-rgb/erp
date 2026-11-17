import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FINDING_STATUSES = ['open', 'in_progress', 'resolved', 'ignored'] as const;

/**
 * PATCH /api/review-findings/[id] — work a finding (Batch G): move it
 * to in_progress, resolve it with a note, or ignore it. Ignoring a
 * finding here is per-finding; a standing ignore rule lives in
 * /api/review-ignore-rules.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const { data: finding } = await supabaseAdmin()
    .from('acct_review_findings')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!finding) return err('NOT_FOUND', 'Review finding not found', 404);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('status' in body) {
    if (!(FINDING_STATUSES as readonly string[]).includes(String(body.status))) {
      return err('VALIDATION', `status must be one of: ${FINDING_STATUSES.join(', ')}`, 400);
    }
    updates.status = body.status;
    if (body.status === 'resolved') updates.resolved_at = new Date().toISOString();
  }
  if ('assigneeId' in body) updates.assignee_id = (body.assigneeId as string) || null;
  if ('resolutionNote' in body) updates.resolution_note = String(body.resolutionNote);
  const { data, error } = await supabaseAdmin()
    .from('acct_review_findings')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
