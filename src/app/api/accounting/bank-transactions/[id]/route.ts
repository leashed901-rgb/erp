import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Categorize (PATCH) and delete (DELETE) one bank transaction.
   Categorize writes category_account_id and moves review_status to
   'categorized' — the state the platform's accept RPC then posts
   from. Posted/matched/excluded rows refuse categorization (409):
   undo or un-exclude first, exactly as the RPCs guard. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const categoryAccountId = typeof body.categoryAccountId === 'string' ? body.categoryAccountId : null;
  if (!categoryAccountId) return err('VALIDATION', 'categoryAccountId is required', 400);
  const sb = supabaseAdmin();
  const { data: cur, error: readErr } = await sb
    .from('acct_bank_transactions')
    .select('review_status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!cur) return err('NOT_FOUND', 'Transaction not found', 404);
  const status = String((cur as { review_status: string }).review_status);
  if (status === 'posted' || status === 'matched') return err('CONFLICT', 'Transaction is already on the books — undo it before recategorizing', 409);
  if (status === 'excluded') return err('CONFLICT', 'Transaction is excluded — restore it before categorizing', 409);
  const { data, error } = await sb
    .from('acct_bank_transactions')
    .update({ category_account_id: categoryAccountId, review_status: 'categorized' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('id, category_account_id, review_status')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('acct_bank_transactions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
