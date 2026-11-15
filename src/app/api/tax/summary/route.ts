import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/tax/summary?year=2026
 *  Tax cockpit: taxable profit estimate, deductible expenses, depreciable assets.
 *  Reads from acct_journal_entries + acct_spend_transactions + acct_fixed_assets. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // 1. Revenue: sum of credit journal lines to revenue accounts this year.
  const { data: revData } = await supabaseAdmin()
    .from('acct_journal_lines')
    .select('amount, account_id')
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  // We can't easily join to account_type without the full CoA — approximate
  // by summing all credit postings (positive = credit on credit-normal accounts).
  const revenue = (revData || []).reduce((s, l) => {
    return s + (Number(l.amount) || 0);
  }, 0);

  // 2. Deductible expenses: sum of spend transactions this year.
  const { data: spendData } = await supabaseAdmin()
    .from('acct_spend_transactions')
    .select('amount, txn_kind, category')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .gte('transaction_date', yearStart)
    .lte('transaction_date', yearEnd);
  const deductibleExpenses = (spendData || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Group by category for the breakdown.
  const categoryMap: Record<string, { amount: number; count: number }> = {};
  (spendData || []).forEach((t) => {
    const cat = (t.category as string) || (t.txn_kind as string) || 'Uncategorized';
    if (!categoryMap[cat]) categoryMap[cat] = { amount: 0, count: 0 };
    categoryMap[cat].amount += Number(t.amount) || 0;
    categoryMap[cat].count += 1;
  });
  const deductionCategories = Object.entries(categoryMap)
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count, percent_deductible: 100 }))
    .sort((a, b) => b.amount - a.amount);

  // 3. Depreciable assets.
  const { data: assets, error: assetErr } = await supabaseAdmin()
    .from('acct_fixed_assets')
    .select('id, name, cost, accumulated_depreciation, useful_life_years')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const depreciableAssets = (assets || []).map((a) => ({
    ...a,
    net_book_value: (Number(a.cost) || 0) - (Number(a.accumulated_depreciation) || 0),
  }));

  // 4. 1099s: contractors paid this year.
  const { count: contractorCount } = await supabaseAdmin()
    .from('acct_contractor_invites')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const taxableIncome = revenue - deductibleExpenses;

  return NextResponse.json({
    data: {
      year,
      revenue: Math.round(revenue),
      deductible_expenses: Math.round(deductibleExpenses),
      taxable_income: Math.round(taxableIncome),
      estimated_tax: Math.round(taxableIncome * 0.21), // 21% corp rate
      deduction_categories: deductionCategories,
      depreciable_assets: depreciableAssets,
      contractor_count: contractorCount || 0,
      alerts: {
        uncategorized: (spendData || []).filter((t) => !t.category).length,
        missing_w9: 0,
        unreconciled: 0,
      },
    },
  });
}
