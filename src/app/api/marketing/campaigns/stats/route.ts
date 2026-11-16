import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Per-campaign delivery stats (doc 24): sends are the campaign's
   email_outbox rows; opens/clicks are email_events joined through
   the outbox row (Resend webhook pipeline writes them). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: outbox, error } = await sb
    .from('email_outbox')
    .select('id, related_id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('related_type', 'crm_campaigns')
    .limit(5000);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (outbox || []) as { id: string; related_id: string; status: string }[];
  const byCampaign = new Map<string, { sent: number; queued: number; failed: number; opens: number; clicks: number }>();
  const campaignByOutbox = new Map<string, string>();
  for (const r of rows) {
    campaignByOutbox.set(r.id, r.related_id);
    if (!byCampaign.has(r.related_id)) {
      byCampaign.set(r.related_id, { sent: 0, queued: 0, failed: 0, opens: 0, clicks: 0 });
    }
    const entry = byCampaign.get(r.related_id)!;
    // 'sent' counts only rows actually delivered — queued rows are not
    // sends, and failed rows are not sends either.
    if (r.status === 'sent') entry.sent++;
    else if (r.status === 'failed') entry.failed++;
    else entry.queued++;
  }
  if (rows.length) {
    const { data: events } = await sb
      .from('email_events')
      .select('outbox_id, event_type')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('outbox_id', rows.map((r) => r.id))
      .limit(10000);
    for (const e of events || []) {
      const ev = e as { outbox_id: string; event_type: string };
      const cid = campaignByOutbox.get(ev.outbox_id);
      if (!cid) continue;
      const entry = byCampaign.get(cid)!;
      if (ev.event_type.includes('open')) entry.opens++;
      if (ev.event_type.includes('click')) entry.clicks++;
    }
  }
  return NextResponse.json({
    data: [...byCampaign.entries()].map(([campaignId, s]) => ({ campaignId, ...s })),
  });
}
