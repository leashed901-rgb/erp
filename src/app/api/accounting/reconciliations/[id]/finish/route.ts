import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* Finish a reconciliation — acct_finish_reconciliation closes the
   period tie-out (optionally posting the adjustment). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { error } = await sb.rpc('acct_finish_reconciliation', {
    p_reconciliation_id: id,
    p_post_adjustment: body.postAdjustment === true,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, finished: true } });
}
