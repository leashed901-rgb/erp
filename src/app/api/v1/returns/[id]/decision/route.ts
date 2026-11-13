import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/returns/[id]/decision — approve or decline a return.
 *  Body: { decision: 'approve'|'decline', reason?: string, message?: string } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const decision = String(body.decision || '');
  if (!['approve', 'decline'].includes(decision)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'decision must be approve or decline', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const newStatus = decision === 'approve' ? 'approved' : 'declined';
  const { data, error } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .update({
      status: newStatus,
      decision_reason: body.reason || null,
      decision_message: body.message || null,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, message: `Return ${newStatus}` });
}
