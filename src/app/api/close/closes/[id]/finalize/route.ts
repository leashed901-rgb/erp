import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/close/closes/[id]/finalize — finalize a close (Batch G).
 * The engine refuses when tasks are open or error findings are open,
 * unless forceNote is given — then the note is recorded on the close
 * and the period moves anyway. periodStatus must be soft_closed or
 * closed (soft_closed is the normal month-end landing).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const periodStatus = String(body.periodStatus || 'soft_closed');
  if (!['soft_closed', 'closed'].includes(periodStatus)) {
    return err('VALIDATION', 'periodStatus must be soft_closed or closed', 400);
  }
  const { data: close } = await supabaseAdmin()
    .from('acct_closes')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!close) return err('NOT_FOUND', 'Close not found', 404);
  const { data, error } = await supabaseAdmin().rpc('acct_finalize_close', {
    p_close_id: id,
    p_period_status: periodStatus,
    p_force_note: (body.forceNote as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data });
}
