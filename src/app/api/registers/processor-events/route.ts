import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/processor-events — payment processor webhook
 * events (Batch I, read-only). One row per event: provider, event
 * id/type, payload and processing status (received | processed |
 * ignored | failed) with an attempt count. Written by the webhook
 * receiver, never by hand.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_processor_events').select('id, provider, event_id, event_type, status, attempts, received_at').eq('tenant_id', DEFAULT_TENANT_ID).order('received_at', { ascending: false }).limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id,
      provider: e.provider,
      eventId: e.event_id,
      eventType: e.event_type,
      status: e.status,
      attempts: e.attempts,
    })),
  });
}
