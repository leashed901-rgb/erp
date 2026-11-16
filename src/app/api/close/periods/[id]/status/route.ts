import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const PERIOD_STATUSES = ['future', 'open', 'soft_closed', 'closed', 'locked'] as const;

/**
 * POST /api/close/periods/[id]/status — set a period's status via the
 * engine (Batch G). Reopening a soft-closed period is a real action
 * here, not a delete — the close row keeps its finalized record.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const status = String(body.status || '');
  if (!(PERIOD_STATUSES as readonly string[]).includes(status)) {
    return err('VALIDATION', `status must be one of: ${PERIOD_STATUSES.join(', ')}`, 400);
  }
  const { data: period } = await supabaseAdmin()
    .from('acct_periods')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!period) return err('NOT_FOUND', 'Period not found', 404);
  const { error } = await supabaseAdmin().rpc('acct_set_period_status', {
    p_period_id: id,
    p_status: status,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data } = await supabaseAdmin()
    .from('acct_periods')
    .select('id,period_no,name,start_date,end_date,status,closed_at')
    .eq('id', id)
    .single();
  return NextResponse.json({ data });
}
