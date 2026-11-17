import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toTransfer } from '../../route';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/bank-transfers/[id]/void — void a transfer via
 * acct_void_transfer (posts the reversing journal). Body: { reason?, date? }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }
  const sb = supabaseAdmin();
  const { data: row } = await sb.from('acct_bank_transfers').select('id,status').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!row) return err('NOT_FOUND', 'Transfer not found', 404);
  if (row.status === 'void') return err('VALIDATION', 'Transfer is already void', 400);
  const { error } = await sb.rpc('acct_void_transfer', {
    p_transfer_id: id,
    p_reason: body.reason ? String(body.reason) : 'Voided from the transfers list',
    p_date: body.date ? String(body.date) : new Date().toISOString().slice(0, 10),
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: after } = await sb.from('acct_bank_transfers').select('*').eq('id', id).single();
  return NextResponse.json({ data: toTransfer(after) });
}
