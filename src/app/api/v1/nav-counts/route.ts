import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/nav-counts (spec §B.4.2)
 *  SideNav badge counts — one cheap call for all nav items. */
export async function GET() {
  const counts: Record<string, number> = {};

  try {
    // Run counts in parallel
    const [customers, leads, tasks, appointments, conversations, deals, invoices] = await Promise.all([
      supabaseAdmin().from('crm_customers').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true),
      supabaseAdmin().from('crm_leads').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).neq('status', 'converted'),
      supabaseAdmin().from('crm_tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).neq('status', 'done'),
      supabaseAdmin().from('crm_appointments').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'scheduled'),
      supabaseAdmin().from('crm_conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).neq('status', 'closed'),
      supabaseAdmin().from('crm_deals').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'open'),
      supabaseAdmin().from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).neq('status', 'PAID'),
    ]);

    counts.customers = customers.count || 0;
    counts.leads = leads.count || 0;
    counts.tasks = tasks.count || 0;
    counts.appointments = appointments.count || 0;
    counts.conversations = conversations.count || 0;
    counts.deals = deals.count || 0;
    counts.invoices = invoices.count || 0;
  } catch {
    // Return empty counts on error — the UI still renders
  }

  return NextResponse.json({ counts });
}
