import { NextRequest, NextResponse } from 'next/server';
import { drainOutbox, outboxCounts, ResendNotConfiguredError } from '@/lib/resend';

/* Mail drain (doc 24): the outbox worker endpoint. POST claims a batch of
   queued email_outbox rows and delivers them through Resend; GET reports
   queue depth by status. Before this route existed nothing drained the
   queue — rows sat 'queued' forever while campaigns reported 'sent'. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  try {
    const counts = await outboxCounts();
    return NextResponse.json({ data: { counts } });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 500) : 50;
  try {
    const result = await drainOutbox(limit);
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof ResendNotConfiguredError) {
      return err('NOT_CONFIGURED', e.message, 503);
    }
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
