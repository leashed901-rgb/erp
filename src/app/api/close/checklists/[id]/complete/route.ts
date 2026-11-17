import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/close/checklists/[id]/complete — mark a checklist row
 * completed (Batch G). The table's CHECK allows open | in_progress |
 * blocked | completed | skipped | reopened — not todo/done.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const status = String(body.status || 'completed');
  if (!['open', 'in_progress', 'blocked', 'completed', 'skipped', 'reopened'].includes(status)) {
    return err('VALIDATION', 'status must be open, in_progress, blocked, completed, skipped or reopened', 400);
  }
  const { data: row } = await supabaseAdmin()
    .from('acct_close_checklists')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!row) return err('NOT_FOUND', 'Checklist item not found', 404);
  const { data, error } = await supabaseAdmin()
    .from('acct_close_checklists')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      notes: body.notes != null ? String(body.notes) : undefined,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
