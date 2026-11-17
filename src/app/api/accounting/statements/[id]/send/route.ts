import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/* POST /api/accounting/statements/[id]/send { reminder?, message? }
 * Sends (or reminds) via the platform's acct_send_statement, which
 * enqueues the email through email_enqueue and stamps the statement
 * (sent_at / reminder_count / email_outbox_id). The response reports
 * the outbox id — the email is QUEUED by the platform mail worker,
 * not delivered from here. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data, error } = await supabaseAdmin().rpc('acct_send_statement', {
    p_statement_id: id,
    p_reminder: body.reminder === true,
    p_message: typeof body.message === 'string' && body.message ? body.message : null,
  });
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 }
    );
  }
  return NextResponse.json({ data: { statementId: id, emailOutboxId: data as string, queued: true } });
}
