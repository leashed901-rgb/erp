import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/** PATCH /api/crm/mailboxes/[id] — disconnect / reconnect a mailbox. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!['active', 'disconnected', 'error'].includes(status)) {
    return fail('VALIDATION', 'status must be active, disconnected or error', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('platform_mailboxes')
    .update({ status })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return fail('INTERNAL', error.message, 500);
  if (!data) return fail('NOT_FOUND', 'Mailbox not found', 404);
  return NextResponse.json({ data });
}
