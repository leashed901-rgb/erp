import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/activity/{type}/{id} (spec §B.4.2)
 *  Activity timeline for a record. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;

  // Map type to the activity reference columns
  const typeMap: Record<string, { table: string; col: string }> = {
    party: { table: 'crm_activity', col: 'customer_id' },
    customer: { table: 'crm_activity', col: 'customer_id' },
    invoice: { table: 'crm_activity', col: 'customer_id' },
    lead: { table: 'crm_lead_activities', col: 'lead_id' },
    appointment: { table: 'crm_appointment_status_history', col: 'appointment_id' },
  };

  const config = typeMap[type] || typeMap.party;
  const { data, error } = await supabaseAdmin()
    .from(config.table)
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq(config.col, id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ data: [] });
  }

  // Normalize to ActivityEntry shape
  const entries = (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    date: String(row.created_at || row.occurred_at || row.changed_at || ''),
    type: String(row.activity_type || row.action || row.from_status ? 'status' : 'created'),
    text: String(row.body || row.description || row.subject || row.reason || 'Activity'),
    actor: String(row.staff_id || row.actor_user_id || row.changed_by || row.created_by || 'System'),
  }));

  return NextResponse.json({ data: entries });
}
