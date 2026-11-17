import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { SupportContextCard } from '@/lib/supportTypes';

/** GET /api/v1/tickets/[id]/context — the workspace context sidebar:
 *  the requester's CRM customer card (since / LTV / lifecycle), their
 *  other tickets, and the linked order when the ticket carries one. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: ticket } = await sb
    .from('support_tickets')
    .select('id, requester_customer_id, requester_email, order_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ticket not found', requestId: crypto.randomUUID() } }, { status: 404 });
  const t = ticket as { requester_customer_id: string | null; requester_email: string | null; order_id: string | null };

  let customer: SupportContextCard['customer'] = null;
  if (t.requester_customer_id) {
    const { data: c } = await sb
      .from('crm_customers')
      .select('id, email, customer_since, lifetime_value, lifecycle_stage')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', t.requester_customer_id)
      .maybeSingle();
    if (c) {
      const row = c as Record<string, unknown>;
      const { data: party } = await sb
        .from('crm_customers')
        .select('party_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', t.requester_customer_id)
        .maybeSingle();
      let name: string | null = null;
      if (party && (party as { party_id?: string }).party_id) {
        const { data: p } = await sb.from('platform_parties').select('display_name').eq('id', (party as { party_id: string }).party_id).maybeSingle();
        name = (p as { display_name?: string } | null)?.display_name ?? null;
      }
      customer = {
        id: String(row.id),
        name,
        email: typeof row.email === 'string' ? row.email : null,
        customerSince: typeof row.customer_since === 'string' ? row.customer_since : null,
        lifetimeValue: row.lifetime_value != null ? Number(row.lifetime_value) : null,
        lifecycleStage: typeof row.lifecycle_stage === 'string' ? row.lifecycle_stage : null,
      };
    }
  }

  let historyQuery = sb
    .from('support_tickets')
    .select('id, ticket_ref, subject, status, created_at, requester_customer_id, requester_email')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('deleted_at', null)
    .neq('id', id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (t.requester_customer_id) historyQuery = historyQuery.eq('requester_customer_id', t.requester_customer_id);
  else if (t.requester_email) historyQuery = historyQuery.eq('requester_email', t.requester_email);
  const { data: history } = t.requester_customer_id || t.requester_email ? await historyQuery : { data: [] };

  let openQuery = sb
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('deleted_at', null)
    .not('status', 'in', '("resolved","closed")');
  if (t.requester_customer_id) openQuery = openQuery.eq('requester_customer_id', t.requester_customer_id);
  else if (t.requester_email) openQuery = openQuery.eq('requester_email', t.requester_email);
  const { count: openCount } = t.requester_customer_id || t.requester_email ? await openQuery : { count: 0 };

  let order: SupportContextCard['order'] = null;
  if (t.order_id) {
    const { data: o } = await sb
      .from('erp_orders')
      .select('id, number, status, total_amount')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', t.order_id)
      .maybeSingle();
    if (o) {
      const row = o as Record<string, unknown>;
      order = {
        id: String(row.id),
        number: typeof row.number === 'string' ? row.number : null,
        status: typeof row.status === 'string' ? row.status : null,
        total: row.total_amount != null ? Number(row.total_amount) : null,
      };
    }
  }

  const card: SupportContextCard = {
    customer,
    openTickets: openCount ?? 0,
    previousTickets: (history || []).map((h) => {
      const row = h as Record<string, unknown>;
      return {
        id: String(row.id),
        ticketRef: String(row.ticket_ref || ''),
        subject: String(row.subject || ''),
        status: String(row.status || ''),
        createdAt: String(row.created_at || ''),
      };
    }),
    order,
  };
  return NextResponse.json({ data: card });
}
