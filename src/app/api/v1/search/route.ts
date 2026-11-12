import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { SearchResult } from '@/lib/contracts';

/** GET /api/v1/search?q=xxx&types=party,invoice&limit=10 (spec §B.4.2) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const types = searchParams.get('types')?.split(',').filter(Boolean) || ['party', 'invoice', 'lead', 'task', 'appointment', 'deal'];
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 50);

  if (!q) return NextResponse.json({ results: [] });

  const results: SearchResult[] = [];

  const searchMap: Record<string, { table: string; fields: string[]; type: string }> = {
    party: { table: 'crm_customers', fields: ['first_name', 'last_name', 'email', 'company_name'], type: 'party' },
    invoice: { table: 'invoices', fields: ['number'], type: 'invoice' },
    lead: { table: 'crm_leads', fields: ['contact_name', 'email', 'phone'], type: 'lead' },
    task: { table: 'crm_tasks', fields: ['title', 'description'], type: 'task' },
    appointment: { table: 'crm_appointments', fields: ['appointment_number'], type: 'appointment' },
    deal: { table: 'crm_deals', fields: ['name', 'deal_number'], type: 'deal' },
  };

  for (const typeName of types) {
    const config = searchMap[typeName];
    if (!config) continue;
    try {
      const orFilter = config.fields.map((f) => `${f}.ilike.%${q}%`).join(',');
      const { data, error } = await supabaseAdmin()
        .from(config.table)
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .or(orFilter)
        .limit(limit);
      if (error || !data) continue;
      for (const row of data) {
        const r = row as Record<string, unknown>;
        const name = String(r.first_name || r.name || r.number || r.title || r.contact_name || r.appointment_number || r.deal_number || 'Unnamed');
        results.push({
          type: config.type,
          id: String(r.id),
          title: name,
          subtitle: r.email ? String(r.email) : r.status ? String(r.status) : undefined,
        });
      }
    } catch {
      // skip this entity on error
    }
  }

  return NextResponse.json({ results: results.slice(0, limit * types.length) });
}
