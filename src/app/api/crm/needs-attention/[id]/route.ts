import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* PATCH /api/crm/needs-attention/[id] — resolve or snooze a flag.
 * crm_needs_attention carries a free-text status; the queue reads
 * status != 'resolved'. Body: { status: 'resolved' | 'snoozed' | 'open' } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status : '';
  if (!['resolved', 'snoozed', 'open'].includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'status must be resolved|snoozed|open', requestId: crypto.randomUUID() } },
      { status: 400 }
    );
  }
  const { data, error } = await supabaseAdmin()
    .from('crm_needs_attention')
    .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: error?.message || 'Flag not found', requestId: crypto.randomUUID() } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data });
}
