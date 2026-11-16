import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { getSalesTaxLiability } from '@/lib/taxEngine';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * GET /api/tax/overview — the Sales Tax stat bar (kpis-5), every tile
 * computed from the module's own tables:
 *   Sales tax payable — acct_sales_tax_liability (open, unfiled tax)
 *   Nexus states      — count of collecting acct_tax_nexus rows
 *   Taxable sales MTD — acct_tax_transactions taxable_amount, this month
 *   Next filing due   — earliest due_date among unpaid acct_tax_filings
 *
 * Two consumers share this endpoint: BusinessTaxOverview reads the raw
 * fields (salesTaxPayable / nexusStates / taxableSalesMtd /
 * nextFilingDue), and the generic overview renderer for the
 * sales_tax-overview screen reads data.kpis (label/value/delta/screen
 * click-throughs). Both shapes are returned.
 */
export async function GET() {
  const db = supabaseAdmin();
  try {
    const now = new Date();
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const [liability, nexus, mtd, filings] = await Promise.all([
      getSalesTaxLiability(db),
      db.from('acct_tax_nexus').select('id', { count: 'exact', head: true })
        .eq('tenant_id', DEFAULT_TENANT_ID).eq('collect_tax', true),
      db.from('acct_tax_transactions').select('taxable_amount')
        .eq('tenant_id', DEFAULT_TENANT_ID).eq('direction', 'sale')
        .gte('tax_date', monthStart).limit(10000),
      db.from('acct_tax_filings').select('due_date, period_label, status')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .not('status', 'in', '("paid","filed")')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true }).limit(1),
    ]);
    const taxableSalesMtd = Math.round((mtd.data || []).reduce((s, r) => s + Number(r.taxable_amount || 0), 0) * 100) / 100;
    const next = (filings.data || [])[0] || null;
    const nextFilingDue = next ? { dueDate: next.due_date, periodLabel: next.period_label, status: next.status } : null;
    const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dueIso = nextFilingDue?.dueDate || monthEnd;
    const dueLabel = new Date(`${dueIso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    return NextResponse.json({
      data: {
        salesTaxPayable: liability.totalOpen,
        liabilityByJurisdiction: liability.rows,
        nexusStates: nexus.count ?? 0,
        taxableSalesMtd,
        nextFilingDue,
        kpis: [
          { label: 'Sales tax payable', value: money(liability.totalOpen), delta: 'unfiled', screen: 'sales_tax-filings' },
          { label: 'Nexus states', value: String(nexus.count ?? 0), delta: 'collecting', screen: 'sales_tax-nexus' },
          { label: 'Taxable sales MTD', value: money(taxableSalesMtd), delta: 'this month', screen: 'sales_tax-tax-transactions' },
          { label: 'Next filing due', value: dueLabel, delta: nextFilingDue ? 'open filing' : 'month end', screen: 'sales_tax-filings' },
        ],
      },
    });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Overview failed', 500);
  }
}
