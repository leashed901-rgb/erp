import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * GET /api/crm/sequence-enrollments — every enrollment across
 * sequences, with the sequence name and the enrolled party's name
 * resolved (customer or lead). The Sequences screen's Enrollments
 * tab reads this.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: enrollments, error } = await sb
    .from('crm_sequence_enrollments')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('enrolled_at', { ascending: false })
    .limit(200);
  if (error) return fail('INTERNAL', error.message, 500);

  const rows = enrollments || [];
  const seqIds = [...new Set(rows.map(r => r.sequence_id))];
  const custIds = [...new Set(rows.map(r => r.customer_id).filter(Boolean))];
  const leadIds = [...new Set(rows.map(r => r.lead_id).filter(Boolean))];
  const [seqRes, custRes, leadRes] = await Promise.all([
    seqIds.length ? sb.from('crm_sequences').select('id, name').in('id', seqIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    custIds.length ? sb.from('crm_customers').select('id, first_name, last_name, company_name').in('id', custIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
    leadIds.length ? sb.from('crm_leads').select('id, contact_name, company_name').in('id', leadIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
  ]);
  const seqName = new Map((seqRes.data || []).map(s => [s.id, s.name]));
  const custName = new Map((custRes.data || []).map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'Customer']));
  const leadName = new Map((leadRes.data || []).map(l => [l.id, l.contact_name || l.company_name || 'Lead']));

  return NextResponse.json({
    data: rows.map(r => ({
      ...r,
      sequence_name: seqName.get(r.sequence_id) || null,
      party_name: (r.customer_id && custName.get(r.customer_id)) || (r.lead_id && leadName.get(r.lead_id)) || r.email || 'Party',
      party_kind: r.customer_id ? 'customer' : r.lead_id ? 'lead' : r.deal_id ? 'deal' : null,
    })),
  });
}
