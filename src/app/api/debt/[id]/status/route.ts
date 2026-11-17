import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/debt/[id]/status — set an instrument's status.
 * Vocabulary: active | paid_off | closed | default.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '');
  if (!['active', 'paid_off', 'closed', 'default'].includes(status)) {
    return err('VALIDATION', 'status must be active, paid_off, closed, or default', 400);
  }
  const { error } = await supabaseAdmin().from('acct_debt_instruments').update({ status }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id, status } });
}
