import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/parties/[id]/peek — the party peek popover (doc 01):
 * balance, last transaction, open tickets, next task, segments.
 * Identity comes from the spine (platform_parties); the live CRM
 * facts are read from the role tables keyed by the same id.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: spine } = await sb
    .from('platform_parties')
    .select('id, party_kind, metadata')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!spine) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Party not found', requestId: crypto.randomUUID() } },
      { status: 404 },
    );
  }
  const m = (spine.metadata || {}) as Record<string, any>;

  const [customerRes, lastActivityRes, ticketsRes, nextTaskRes, membershipsRes] = await Promise.all([
    sb
      .from('crm_customers')
      .select('outstanding_balance, lifetime_value')
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .maybeSingle(),
    sb
      .from('crm_activity')
      .select('activity_type, subject, occurred_at')
      .eq('customer_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('occurred_at', { ascending: false })
      .limit(1),
    sb
      .from('crm_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .is('resolved_at', null),
    sb
      .from('crm_tasks')
      .select('id, title, due_at, priority')
      .eq('customer_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .neq('status', 'completed')
      .order('due_at', { ascending: true })
      .limit(1),
    sb
      .from('crm_segment_memberships')
      .select('segment_id')
      .eq('customer_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .is('exited_at', null),
  ]);

  let segments: string[] = [];
  const segmentIds = (membershipsRes.data || []).map((r: any) => r.segment_id);
  if (segmentIds.length) {
    const { data: segs } = await sb.from('crm_segments').select('name').in('id', segmentIds);
    segments = (segs || []).map((s: any) => s.name);
  }

  const customer = customerRes.data as { outstanding_balance: number | null; lifetime_value: number | null } | null;
  const last = (lastActivityRes.data || [])[0] || null;
  const nextTask = (nextTaskRes.data || [])[0] || null;

  return NextResponse.json({
    data: {
      id,
      name: m.name || 'Unnamed',
      email: m.email || null,
      phone: m.phone || null,
      roles: m.roles || [],
      balance: customer ? Number(customer.outstanding_balance) || 0 : m.balance || 0,
      lifetime_value: customer ? Number(customer.lifetime_value) || 0 : m.lifetimeValue || 0,
      last_transaction: last
        ? { type: last.activity_type, subject: last.subject, at: last.occurred_at }
        : null,
      open_tickets: ticketsRes.count || 0,
      next_task: nextTask
        ? { id: nextTask.id, title: nextTask.title, due_at: nextTask.due_at, priority: nextTask.priority }
        : null,
      segments,
    },
  });
}
