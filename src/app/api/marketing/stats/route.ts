import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Marketing KPIs (kpis-3.md): the six tiles the Publishing Overview
   renders. All counts come from the live tables — 'sent' counts only
   outbox rows Resend actually accepted, and the open rate is opened /
   sent (null — shown as '—' — until anything has been sent). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [campaigns, sent, opened, promos, subs, scheduled] = await Promise.all([
    sb.from('crm_campaigns').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).in('status', ['active', 'sending']),
    sb.from('email_outbox').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'sent').gte('sent_at', d30),
    sb.from('email_outbox').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'opened'),
    sb.from('commerce_promotions').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true).or(`start_at.is.null,start_at.lte.${now.toISOString()}`).or(`end_at.is.null,end_at.gte.${now.toISOString()}`),
    sb.from('platform_webform_submissions').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).gte('created_at', d7),
    sb.from('social_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'scheduled'),
  ]);
  const firstErr = [campaigns, sent, opened, promos, subs, scheduled].find((r) => r.error);
  if (firstErr?.error) return err('INTERNAL', firstErr.error.message, 500);

  const sentTotal = await sb.from('email_outbox').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'sent');
  if (sentTotal.error) return err('INTERNAL', sentTotal.error.message, 500);

  const sentCount = sentTotal.count ?? 0;
  const openedCount = opened.count ?? 0;
  return NextResponse.json({
    data: {
      campaignsActive: campaigns.count ?? 0,
      emailsSent30d: sent.count ?? 0,
      openRate: sentCount > 0 ? Math.round((openedCount / sentCount) * 1000) / 10 : null,
      promotionsActive: promos.count ?? 0,
      webformSubmissions7d: subs.count ?? 0,
      socialScheduled: scheduled.count ?? 0,
    },
  });
}
