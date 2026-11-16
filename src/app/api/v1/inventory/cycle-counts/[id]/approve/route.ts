import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/cycle-counts/[id]/approve — approve a submitted count.
 * Approval is the human gate for large variances: acct_post_erp_count_session
 * refuses to post any line whose variance is worth more than $10,000 unless
 * the session carries approved_at. Approving does not post anything.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: session } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('id,status,approved_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!session) return err('NOT_FOUND', 'Count session not found', 404);
  if (session.status === 'posted') {
    return err('VALIDATION', 'Count is already posted — nothing to approve', 400);
  }
  if (session.status !== 'submitted') {
    return err('VALIDATION', `Count is ${session.status} — submit it before approving`, 400);
  }
  if (session.approved_at) {
    return NextResponse.json({ data: session });
  }
  const { data, error } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .update({ approved_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
