import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Server helpers for support (doc 26). */

/** The tenant's first auth user — the operator identity for
    server-side actions that need a user id (same resolution the
    social approve flow uses). */
export async function tenantOperatorUserId(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
  return data?.users?.[0]?.id ?? null;
}

/** Next ticket ref from the platform counter (support_next_ticket_ref);
    falls back to a timestamp ref if the counter RPC is unavailable. */
export async function nextTicketRef(): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('support_next_ticket_ref', { p_tenant_id: DEFAULT_TENANT_ID });
  if (!error && typeof data === 'string' && data) return data;
  return `TKT-${Date.now()}`;
}

/** Map a ticket source channel onto a crm_conversations channel. */
export function conversationChannel(sourceChannel: string | null | undefined): string {
  switch ((sourceChannel || '').toLowerCase()) {
    case 'email':
      return 'email';
    case 'chat':
    case 'live_chat':
    case 'live chat':
      return 'chat';
    case 'internal':
      return 'internal';
    default:
      return 'web_form';
  }
}

/** Create the crm_conversations row every support ticket must link to
    (support_tickets.conversation_id is NOT NULL). */
export async function createTicketConversation(input: {
  channel: string;
  subject: string;
  customerId?: string | null;
}): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('crm_conversations')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: input.customerId || null,
      channel: input.channel,
      status: 'open',
      subject: input.subject,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return String((data as { id: string }).id);
}

/** Append an immutable support_ticket_events row. The event text lives
    in `detail`; visibility is 'public' for customer-facing messages and
    'internal' for notes/system events. */
export async function appendTicketEvent(input: {
  ticketId: string;
  eventType: string;
  detail: string;
  actorType?: string;
  actorStaffId?: string | null;
  actorLabel?: string | null;
  visibility?: string;
  payload?: Record<string, unknown>;
}): Promise<{ id: string } | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_ticket_events')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      ticket_id: input.ticketId,
      event_type: input.eventType,
      detail: input.detail,
      actor_type: input.actorType || 'staff',
      actor_staff_id: input.actorStaffId || null,
      actor_label: input.actorLabel || null,
      visibility: input.visibility || 'public',
      payload: input.payload || {},
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return { id: String((data as { id: string }).id) };
}
