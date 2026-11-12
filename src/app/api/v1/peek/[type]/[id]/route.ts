import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { PeekCard, MenuAction } from '@/lib/contracts';

/** GET /api/v1/peek/{type}/{id} — peek popover data (spec §B.4.2) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;

  // Map type → Supabase table + fields
  const tableMap: Record<string, { table: string; nameField: string; extraFields: string[] }> = {
    party: { table: 'crm_customers', nameField: 'first_name', extraFields: ['email', 'phone', 'outstanding_balance', 'lifetime_value'] },
    invoice: { table: 'invoices', nameField: 'number', extraFields: ['status', 'total', 'balanceDue'] },
    lead: { table: 'crm_leads', nameField: 'contact_name', extraFields: ['email', 'phone', 'status', 'score'] },
    task: { table: 'crm_tasks', nameField: 'title', extraFields: ['status', 'priority', 'due_at'] },
    appointment: { table: 'crm_appointments', nameField: 'appointment_number', extraFields: ['status', 'starts_at', 'ends_at'] },
    deal: { table: 'crm_deals', nameField: 'name', extraFields: ['status', 'amount', 'stage_id'] },
    ticket: { table: 'crm_conversations', nameField: 'subject', extraFields: ['status', 'channel'] },
  };

  const config = tableMap[type];
  if (!config) {
    // Return a generic peek with just the ID
    return NextResponse.json({ data: { type, id, title: id, subtitle: null, fields: [], pills: [], actions: [] } as PeekCard });
  }

  const { data, error } = await supabaseAdmin()
    .from(config.table)
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (error || !data) {
    return NextResponse.json({ data: { type, id, title: 'Not found', subtitle: null, fields: [], pills: [], actions: [] } as PeekCard });
  }

  const row = data as Record<string, unknown>;
  const title = String(row[config.nameField] || row.name || id);
  const fields = config.extraFields
    .filter((f) => row[f] != null)
    .map((f) => ({ label: f.replace(/_/g, ' '), value: String(row[f]) }));

  const pills = [];
  if (row.status) pills.push({ type: 'status' as const, label: String(row.status) });
  if (row.balance != null || row.outstanding_balance != null) {
    const bal = Number(row.outstanding_balance || row.balance || 0);
    if (bal > 0) pills.push({ type: 'alert' as const, label: `$${bal.toFixed(2)} owed` });
  }

  const actions: MenuAction[] = [
    { id: 'open', label: 'Open', icon: 'open_in_new', section: 'open' },
    { id: 'edit', label: 'Edit', icon: 'edit', section: 'open' },
  ];

  const card: PeekCard = { type, id, title, subtitle: row.email ? String(row.email) : undefined, fields, pills, actions };
  return NextResponse.json({ data: card });
}
