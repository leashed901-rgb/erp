import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSellerSettlement } from '@/lib/sellerTypes';

/* Hold a settlement (doc 21 settlements workspace): keeps the
   settlement pending and records why (pending_reason), optionally
   pushing execute_after out. Releasing the hold is a PATCH of the
   same fields back to null via approve/hold with {release: true}. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('seller_settlements')
    .select('id, state')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Settlement not found', 404);
  if (current.state !== 'pending') return err('CONFLICT', `Settlement is ${current.state as string} — only a pending settlement can be held`, 409);
  const release = body.release === true;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  if (!release && !reason) return err('VALIDATION', 'reason is required to hold a settlement', 400);
  const { data, error } = await sb
    .from('seller_settlements')
    .update({
      pending_reason: release ? null : reason,
      execute_after: release ? null : (typeof body.executeAfter === 'string' ? body.executeAfter : undefined),
    })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSellerSettlement(data as Record<string, unknown>) });
}
