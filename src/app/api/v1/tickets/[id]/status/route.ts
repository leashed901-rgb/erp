import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/tickets/[id]/status — change ticket status. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const status = String(body.status || '');
  if (!status) return NextResponse.json({ error: { code: 'VALIDATION', message: 'status is required', requestId: crypto.randomUUID() } }, { status: 400 });

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'resolved') updates.resolved_at = new Date().toISOString();
  if (status === 'closed') {
    updates.closed_at = new Date().toISOString();
    updates.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin()
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}
