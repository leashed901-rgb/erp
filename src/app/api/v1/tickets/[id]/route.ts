import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/tickets/[id] — single ticket. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ticket not found', requestId: crypto.randomUUID() } }, { status: 404 });
  return NextResponse.json({ data });
}

/** PATCH /api/v1/tickets/[id] — update ticket fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['status', 'priority', 'assigned_staff_id', 'category', 'ticket_type', 'tags', 'pending_reason', 'on_hold', 'resolution_due_at', 'csat_score', 'csat_comment', 'merged_into_id', 'spam_flag']) {
    if (f in body) updates[f] = body[f];
  }
  if (body.status === 'resolved') updates.resolved_at = new Date().toISOString();
  if (body.status === 'closed') { updates.closed_at = new Date().toISOString(); updates.resolved_at = updates.resolved_at || new Date().toISOString(); }

  const { data, error } = await supabaseAdmin().from('support_tickets').update(updates).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error || !data) return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Not found', requestId: crypto.randomUUID() } }, { status: 400 });
  return NextResponse.json({ data });
}
