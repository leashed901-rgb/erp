import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/channels/overview — the Ecommerce page data (pack 3):
 * the six KPI tiles from kpis-3 (each computed from its named source)
 * plus the carts and checkout-sessions lists the page renders.
 */
export async function GET() {
  const db = supabaseAdmin();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [carts24, sessionsMonth, promos, giftCards, channelsConnected, hooks24, inbox24, carts, sessions] = await Promise.all([
    db.from('commerce_carts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID).gte('updated_at', dayAgo),
    db.from('commerce_checkout_sessions').select('status')
      .eq('tenant_id', DEFAULT_TENANT_ID).gte('started_at', monthStart.toISOString()),
    db.from('commerce_promotions').select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true),
    db.from('acct_gift_cards').select('balance, status')
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'active'),
    db.from('integration_connections').select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'active'),
    db.from('commerce_channel_events').select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID).gte('created_at', dayAgo),
    db.from('integration_webhook_inbox').select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID).gte('received_at', dayAgo),
    db.from('commerce_carts')
      .select('id, status, total, subtotal, currency, customer_id, updated_at, abandon_email_sent_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('updated_at', { ascending: false })
      .limit(50),
    db.from('commerce_checkout_sessions')
      .select('id, status, amount_due, amount_received, cart_id, started_at, completed_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('started_at', { ascending: false })
      .limit(50),
  ]);

  const started = (sessionsMonth.data || []).length;
  const completed = (sessionsMonth.data || []).filter(s => s.status === 'completed').length;
  const giftOutstanding = (giftCards.data || []).reduce((sum, c) => sum + Number(c.balance || 0), 0);

  return NextResponse.json({
    data: {
      tiles: {
        carts24h: carts24.count ?? 0,
        checkoutConversion: started > 0 ? Math.round((completed / started) * 1000) / 10 : null,
        checkoutsStarted: started,
        checkoutsCompleted: completed,
        activePromotions: promos.count ?? 0,
        giftCardsOutstanding: giftOutstanding,
        channelsConnected: channelsConnected.count ?? 0,
        webhookEvents24h: (hooks24.count ?? 0) + (inbox24.count ?? 0),
      },
      carts: carts.data || [],
      sessions: sessions.data || [],
    },
  });
}
