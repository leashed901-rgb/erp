import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* GET /api/platform/export — the sidebar Export button. Builds a JSON
   bundle of the tenant's core business datasets and records the export
   in platform_backups (backup_type 'export'), then returns the bundle
   as a file download. Every dataset is tenant-scoped and row-capped;
   the counts in the manifest are the real exported row counts. */

const DATASETS: { key: string; table: string; tenantScoped: boolean }[] = [
  { key: 'parties', table: 'platform_parties', tenantScoped: true },
  { key: 'leads', table: 'crm_leads', tenantScoped: true },
  { key: 'deals', table: 'crm_deals', tenantScoped: true },
  { key: 'appointments', table: 'crm_appointments', tenantScoped: true },
  { key: 'invoices', table: 'acct_ar_invoices', tenantScoped: true },
  { key: 'orders', table: 'erp_orders', tenantScoped: true },
  { key: 'products', table: 'products', tenantScoped: true },
  { key: 'support_tickets', table: 'support_tickets', tenantScoped: true },
  { key: 'ad_campaigns', table: 'ad_campaigns', tenantScoped: true },
  { key: 'saved_views', table: 'platform_saved_views', tenantScoped: true },
  { key: 'custom_fields', table: 'platform_custom_fields', tenantScoped: true },
];

const ROW_CAP = 1000;

export async function GET() {
  const sb = supabaseAdmin();
  const { data: tenant } = await sb
    .from('tenants')
    .select('id, name, slug, legal_name, default_currency, plan_tier')
    .eq('id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (!tenant) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Tenant not found', requestId: crypto.randomUUID() } },
      { status: 404 },
    );
  }

  const exportedAt = new Date().toISOString();
  const datasets: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  await Promise.all(
    DATASETS.map(async (d) => {
      let q = sb.from(d.table).select('*').limit(ROW_CAP);
      if (d.tenantScoped) q = q.eq('tenant_id', DEFAULT_TENANT_ID);
      const { data, error } = await q;
      datasets[d.key] = error ? [] : ((data || []) as unknown[]);
      rowCounts[d.key] = datasets[d.key].length;
    }),
  );

  const bundle = {
    export: {
      kind: 'unleashe-workspace-export',
      version: 1,
      exportedAt,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      rowCounts,
    },
    tenant,
    datasets,
  };
  const body = JSON.stringify(bundle, null, 2);

  // Record the export in the platform's backup ledger. A ledger failure
  // must not block the download the user asked for.
  await sb.from('platform_backups').insert({
    tenant_id: DEFAULT_TENANT_ID,
    backup_type: 'export',
    scope: 'tenant',
    status: 'completed',
    size_bytes: new TextEncoder().encode(body).length,
    row_counts: rowCounts,
    started_at: exportedAt,
    completed_at: new Date().toISOString(),
  });

  const filename = `unleashe-export-${tenant.slug || 'workspace'}-${exportedAt.slice(0, 10)}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
