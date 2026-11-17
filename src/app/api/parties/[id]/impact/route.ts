import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/parties/[id]/impact — shared-record banner data (doc 01).
 * platform_parties is the spine: one human, many roles, and records in
 * other modules hang off the same id. This counts what is linked so
 * the UI can warn before a merge / archive / delete touches them.
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

  const byCustomer = async (table: string) => {
    const { count } = await sb
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('customer_id', id);
    return count || 0;
  };

  const [notes, tasks, activity, appointments, conversations, deals, dupRes] = await Promise.all([
    byCustomer('crm_notes'),
    byCustomer('crm_tasks'),
    byCustomer('crm_activity'),
    byCustomer('crm_appointments'),
    byCustomer('crm_conversations'),
    byCustomer('crm_deals'),
    sb
      .from('crm_duplicate_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .or(`record_a.eq.${id},record_b.eq.${id}`),
  ]);

  const linked = {
    notes,
    tasks,
    activity,
    appointments,
    conversations,
    deals,
    duplicate_candidates: dupRes.count || 0,
  };
  const total = Object.values(linked).reduce((a, b) => a + b, 0);
  const roles = ((spine?.metadata as Record<string, unknown> | null)?.roles as string[]) || [];

  return NextResponse.json({
    data: {
      party_id: id,
      found: !!spine,
      kind: spine?.party_kind || null,
      roles,
      linked,
      total,
      shared: roles.length > 1 || total > 0,
    },
  });
}
