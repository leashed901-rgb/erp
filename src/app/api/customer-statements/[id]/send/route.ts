import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { deliverOutboxRow, ResendNotConfiguredError } from '@/lib/resend';
import { toStatementDto } from '@/lib/customerStatements';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/customer-statements/[id]/send — send a statement (or a
 * reminder) via acct_send_statement, which enqueues the mail, then deliver
 * the outbox row through Resend. Body: { reminder?: boolean, message?: string }.
 * Delivery failure returns 502 EMAIL_DELIVERY_FAILED with the statement
 * marked sent in meta — never claims sent when it didn't.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }
  const sb = supabaseAdmin();
  const { data: stmt } = await sb.from('acct_customer_statements').select('id,status').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!stmt) return err('NOT_FOUND', 'Statement not found', 404);
  const { data: outboxId, error: rpcErr } = await sb.rpc('acct_send_statement', {
    p_statement_id: id,
    p_reminder: Boolean(body.reminder),
    p_message: body.message ? String(body.message) : null,
  });
  if (rpcErr) return err('VALIDATION', rpcErr.message, 400);
  try {
    const { resendId } = await deliverOutboxRow(String(outboxId));
    const { data: after } = await sb.from('acct_customer_statements').select('*').eq('id', id).single();
    return NextResponse.json({ data: toStatementDto(after), meta: { email_id: resendId } });
  } catch (e) {
    const { data: after } = await sb.from('acct_customer_statements').select('*').eq('id', id).single();
    const message = e instanceof ResendNotConfiguredError
      ? e.message
      : e instanceof Error ? e.message : 'Email delivery failed';
    return NextResponse.json(
      {
        error: { code: 'EMAIL_DELIVERY_FAILED', message, requestId: crypto.randomUUID() },
        meta: { statement_marked_sent: true, statement: after ? toStatementDto(after) : null },
      },
      { status: 502 },
    );
  }
}
