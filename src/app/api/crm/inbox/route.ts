import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * GET /api/crm/inbox — the global mailbox (Contacts / CRM / Inbox):
 * connected mailboxes (platform_mailboxes), threaded conversations
 * with parties (crm_conversations + crm_messages), and the KPI
 * strip: connected mailboxes, unread threads, party-linked threads,
 * failed sends (24h). Threads carry the party name, a last-message
 * preview and their unread count.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [mailboxRes, convRes, failedRes] = await Promise.all([
    sb.from('platform_mailboxes')
      .select('id, email_address, provider, sync_mode, status, last_synced_at, last_error')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('email_address'),
    sb.from('crm_conversations')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('last_message_at', { ascending: false })
      .limit(100),
    sb.from('crm_messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'failed')
      .gte('created_at', since24h),
  ]);
  if (convRes.error) return fail('INTERNAL', convRes.error.message, 500);
  const conversations = convRes.data || [];

  const convIds = conversations.map(c => c.id);
  const custIds = [...new Set(conversations.map(c => c.customer_id).filter(Boolean))];
  const [msgRes, custRes] = await Promise.all([
    convIds.length
      ? sb.from('crm_messages')
          .select('conversation_id, direction, body, body_text, created_at, read_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as Record<string, any>[] }),
    custIds.length
      ? sb.from('crm_customers').select('id, first_name, last_name, company_name, email').in('id', custIds)
      : Promise.resolve({ data: [] as Record<string, any>[] }),
  ]);
  const cust = new Map((custRes.data || []).map(c => [c.id, c]));
  const lastByConv = new Map<string, Record<string, any>>();
  const unreadByConv = new Map<string, number>();
  for (const m of msgRes.data || []) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    if (m.direction === 'inbound' && !m.read_at) {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
    }
  }

  const threads = conversations.map(c => {
    const party = c.customer_id ? cust.get(c.customer_id) : null;
    const last = lastByConv.get(c.id);
    return {
      ...c,
      party_name: party ? ([party.first_name, party.last_name].filter(Boolean).join(' ') || party.company_name || 'Customer') : null,
      party_email: party?.email ?? null,
      last_message_preview: last ? String(last.body_text || last.body || '').slice(0, 140) : null,
      last_message_direction: last?.direction ?? null,
      unread_count: unreadByConv.get(c.id) || 0,
    };
  });

  return NextResponse.json({
    data: {
      mailboxes: mailboxRes.data || [],
      threads,
      kpis: {
        connectedMailboxes: (mailboxRes.data || []).filter(m => m.status === 'active').length,
        unreadThreads: threads.filter(t => t.unread_count > 0).length,
        linkedThreads: threads.filter(t => t.customer_id).length,
        failedSends: failedRes.count || 0,
      },
    },
  });
}
