import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * PATCH /api/crm/sequence-enrollments/[id] — the enrollment
 * lifecycle actions from the Sequences template:
 *   { action: 'pause' }    → status 'paused'
 *   { action: 'resume' }   → status 'active'
 *   { action: 'advance' }  → current_step + 1 (completes the
 *                            enrollment when it passes the last step)
 *   { action: 'remove' }   → status 'removed'
 *   { action: 'complete' } → status 'completed' + completed_at
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action ? String(body.action) : '';
  if (!['pause', 'resume', 'advance', 'remove', 'complete'].includes(action)) {
    return fail('VALIDATION', 'action must be pause, resume, advance, remove or complete', 400);
  }
  const sb = supabaseAdmin();
  const { data: enrollment, error: readError } = await sb
    .from('crm_sequence_enrollments')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readError) return fail('INTERNAL', readError.message, 500);
  if (!enrollment) return fail('NOT_FOUND', 'Enrollment not found', 404);

  const updates: Record<string, unknown> = {};
  if (action === 'pause') updates.status = 'paused';
  if (action === 'resume') updates.status = 'active';
  if (action === 'remove') updates.status = 'stopped';
  if (action === 'complete') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }
  if (action === 'advance') {
    const { count } = await sb
      .from('crm_sequence_steps')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('sequence_id', enrollment.sequence_id);
    const totalSteps = count || 0;
    const next = Number(enrollment.current_step || 1) + 1;
    if (totalSteps > 0 && next > totalSteps) {
      updates.current_step = totalSteps;
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
    } else {
      updates.current_step = next;
      updates.status = 'active';
    }
  }

  const { data, error } = await sb
    .from('crm_sequence_enrollments')
    .update(updates)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
