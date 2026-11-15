import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/accounts/seed — seeds the standard chart of accounts.
 *
 * Source: upload/chart of accounts.txt — the canonical CoA for this tenant.
 * Seeds all accounts (1001-4090 + 5000-6070) with correct account_type,
 * normal_balance, and subtype. Idempotent: skips codes that already exist.
 *
 * Account type → normal_balance mapping:
 *   Assets (1000s)      → debit
 *   Liabilities (2000s) → credit
 *   Equity (3000s)      → credit
 *   Revenue (4000s)     → credit
 *   Expenses (5000s+)   → debit
 */
interface SeedAccount {
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  subtype: string;
  description: string;
  detail_type?: string;
  is_reconcilable?: boolean;
  is_control_account?: boolean;
}

const SEED_CHART: SeedAccount[] = [
  // ── Current Assets (1000-1139) ──
  { code: '1001', name: 'Cash on Hand', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Physical currency kept at your business' },
  { code: '1005', name: 'Checking Account', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Your primary business bank account', is_reconcilable: true },
  { code: '1010', name: 'Savings Account', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Business savings and reserves', is_reconcilable: true },
  { code: '1020', name: 'Accounts Receivable', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Money owed to you by customers', is_control_account: true },
  { code: '1025', name: 'Inventory', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Goods held for sale (if applicable)', is_control_account: true },
  { code: '1030', name: 'Prepaid Expenses', account_type: 'asset', normal_balance: 'debit', subtype: 'current_asset', description: 'Services paid for in advance (insurance, rent)' },

  // ── Fixed Assets (1040-1065) ──
  { code: '1040', name: 'Equipment', account_type: 'asset', normal_balance: 'debit', subtype: 'fixed_asset', description: 'Computers, machinery, tools' },
  { code: '1045', name: 'Accumulated Depreciation - Equipment', account_type: 'asset', normal_balance: 'credit', subtype: 'contra_asset', description: 'Tracks value reduction over time' },
  { code: '1050', name: 'Vehicles', account_type: 'asset', normal_balance: 'debit', subtype: 'fixed_asset', description: 'Business-owned vehicles' },
  { code: '1055', name: 'Accumulated Depreciation - Vehicles', account_type: 'asset', normal_balance: 'credit', subtype: 'contra_asset', description: 'Vehicle depreciation' },
  { code: '1060', name: 'Furniture and Fixtures', account_type: 'asset', normal_balance: 'debit', subtype: 'fixed_asset', description: 'Office furniture, display cases' },
  { code: '1065', name: 'Leasehold Improvements', account_type: 'asset', normal_balance: 'debit', subtype: 'fixed_asset', description: 'Improvements to rented space' },

  // ── Other Assets (1070-1080) ──
  { code: '1070', name: 'Security Deposits', account_type: 'asset', normal_balance: 'debit', subtype: 'other_asset', description: 'Deposits paid on leases or utilities' },
  { code: '1075', name: 'Long-Term Investments', account_type: 'asset', normal_balance: 'debit', subtype: 'other_asset', description: 'Investments held beyond one year' },
  { code: '1080', name: 'Intangible Assets', account_type: 'asset', normal_balance: 'debit', subtype: 'other_asset', description: 'Patents, trademarks, goodwill' },

  // ── Current Liabilities (2000-2040) ──
  { code: '2000', name: 'Accounts Payable', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Money you owe to vendors and suppliers', is_control_account: true },
  { code: '2010', name: 'Credit Card Payable', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Outstanding credit card balances', is_reconcilable: true },
  { code: '2020', name: 'Payroll Liabilities', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Wages and taxes owed to employees' },
  { code: '2025', name: 'Sales Tax Payable', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Collected sales tax awaiting remittance' },
  { code: '2030', name: 'Short-Term Loans', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Loans due within one year' },
  { code: '2035', name: 'Current Portion of Long-Term Debt', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: "This year's payments on long-term loans" },
  { code: '2040', name: 'Unearned Revenue', account_type: 'liability', normal_balance: 'credit', subtype: 'current_liability', description: 'Payments received for services not yet delivered' },

  // ── Long-Term Liabilities (2050-2070) ──
  { code: '2050', name: 'Long-Term Loans', account_type: 'liability', normal_balance: 'credit', subtype: 'long_term_liability', description: 'Bank loans, equipment financing beyond one year' },
  { code: '2060', name: 'Mortgage Payable', account_type: 'liability', normal_balance: 'credit', subtype: 'long_term_liability', description: 'Property loans' },
  { code: '2070', name: 'Lease Obligations', account_type: 'liability', normal_balance: 'credit', subtype: 'long_term_liability', description: 'Long-term lease commitments' },

  // ── Equity (3000-3030) ──
  { code: '3000', name: "Owner's Capital", account_type: 'equity', normal_balance: 'credit', subtype: 'equity', description: 'Original investment in the business' },
  { code: '3005', name: "Owner's Draw", account_type: 'equity', normal_balance: 'debit', subtype: 'contra_equity', description: 'Money taken out by the owner (reduces equity)' },
  { code: '3010', name: 'Retained Earnings', account_type: 'equity', normal_balance: 'credit', subtype: 'equity', description: 'Accumulated profits kept in the business' },
  { code: '3020', name: 'Common Stock', account_type: 'equity', normal_balance: 'credit', subtype: 'equity', description: 'Shares issued (for corporations)' },
  { code: '3030', name: 'Additional Paid-In Capital', account_type: 'equity', normal_balance: 'credit', subtype: 'equity', description: 'Amounts above par value (corporations)' },

  // ── Revenue (4000-4090) ──
  { code: '4000', name: 'Sales Revenue', account_type: 'revenue', normal_balance: 'credit', subtype: 'operating_revenue', description: 'Income from products sold' },
  { code: '4010', name: 'Service Revenue', account_type: 'revenue', normal_balance: 'credit', subtype: 'operating_revenue', description: 'Income from services provided' },
  { code: '4020', name: 'Consulting Revenue', account_type: 'revenue', normal_balance: 'credit', subtype: 'operating_revenue', description: 'Income from consulting work' },
  { code: '4050', name: 'Interest Income', account_type: 'revenue', normal_balance: 'credit', subtype: 'other_income', description: 'Interest earned on bank accounts' },
  { code: '4060', name: 'Other Income', account_type: 'revenue', normal_balance: 'credit', subtype: 'other_income', description: 'Miscellaneous income sources' },
  { code: '4090', name: 'Sales Returns and Allowances', account_type: 'revenue', normal_balance: 'debit', subtype: 'contra_revenue', description: 'Reduces revenue for returns (contra-revenue)' },

  // ── Cost of Goods Sold (5000-5015) ──
  { code: '5000', name: 'Cost of Goods Sold', account_type: 'expense', normal_balance: 'debit', subtype: 'cogs', description: 'Direct costs of products sold' },
  { code: '5005', name: 'Direct Labor', account_type: 'expense', normal_balance: 'debit', subtype: 'cogs', description: 'Labor directly producing goods/services' },
  { code: '5010', name: 'Materials and Supplies', account_type: 'expense', normal_balance: 'debit', subtype: 'cogs', description: 'Raw materials for production' },
  { code: '5015', name: 'Subcontractor Costs', account_type: 'expense', normal_balance: 'debit', subtype: 'cogs', description: 'Outsourced production costs', detail_type: '1099' },

  // ── Operating Expenses (5020-5090) ──
  { code: '5020', name: 'Advertising and Marketing', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'All marketing costs' },
  { code: '5030', name: 'Bank Fees and Charges', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Bank and payment processing fees' },
  { code: '5040', name: 'Depreciation Expense', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Annual equipment value reduction' },
  { code: '5050', name: 'Insurance', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Business insurance premiums' },
  { code: '5060', name: 'Legal and Professional Fees', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Lawyers, accountants, consultants' },
  { code: '5070', name: 'Office Supplies', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Paper, pens, general supplies' },
  { code: '5080', name: 'Rent Expense', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Office or facility rent' },
  { code: '5090', name: 'Repairs and Maintenance', account_type: 'expense', normal_balance: 'debit', subtype: 'operating_expense', description: 'Equipment and facility upkeep' },

  // ── Overhead Costs (6000-6045) ──
  { code: '6000', name: 'Software and Subscriptions', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Business software costs' },
  { code: '6010', name: 'Telephone and Internet', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Communication costs' },
  { code: '6020', name: 'Travel and Entertainment', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Business travel expenses' },
  { code: '6030', name: 'Utilities', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Electric, gas, water' },
  { code: '6040', name: 'Wages and Salaries', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Employee compensation' },
  { code: '6045', name: 'Payroll Taxes', account_type: 'expense', normal_balance: 'debit', subtype: 'overhead', description: 'Employer portion of payroll taxes' },

  // ── Other Expenses (6050-6070) ──
  { code: '6050', name: 'Interest Expense', account_type: 'expense', normal_balance: 'debit', subtype: 'other_expense', description: 'Interest on loans and credit' },
  { code: '6060', name: 'Income Tax Expense', account_type: 'expense', normal_balance: 'debit', subtype: 'other_expense', description: 'Federal and state income taxes' },
  { code: '6070', name: 'Miscellaneous Expense', account_type: 'expense', normal_balance: 'debit', subtype: 'other_expense', description: 'Expenses not fitting other categories' },
];

export async function POST(_req: NextRequest) {
  // entity_id is NOT NULL on acct_chart_of_accounts — load the tenant's entity.
  const { data: entity } = await supabaseAdmin()
    .from('acct_entities')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  const entityId = entity?.id;
  if (!entityId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'No acct_entities row found for this tenant. Create an entity first.' } }, { status: 400 });
  }

  // Load existing codes to skip (idempotent).
  const { data: existing } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('code')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const existingCodes = new Set((existing || []).map((r: { code: string }) => r.code));

  const toInsert = SEED_CHART
    .filter((a) => !existingCodes.has(a.code))
    .map((a, i) => ({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      code: a.code,
      name: a.name,
      account_type: a.account_type,
      normal_balance: a.normal_balance,
      subtype: a.subtype,
      description: a.description,
      currency: 'USD',
      is_active: true,
      is_posting_allowed: true,
      is_reconcilable: a.is_reconcilable || false,
      is_control_account: a.is_control_account || false,
      is_system: false,
      sort_order: i,
      ...(a.detail_type ? { detail_type: a.detail_type } : {}),
    }));

  if (toInsert.length === 0) {
    const { count } = await supabaseAdmin()
      .from('acct_chart_of_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID);
    return NextResponse.json({ data: { seeded: 0, total: count || 0, message: 'Chart of accounts already seeded — no new accounts inserted.' } });
  }

  const { data: inserted, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .insert(toInsert)
    .select('id, code, name, account_type');

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const { count } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({
    data: {
      seeded: inserted?.length || 0,
      total: count || 0,
      accounts: inserted,
      message: `Seeded ${inserted?.length || 0} accounts. Chart of accounts now has ${count || 0} accounts total.`,
    },
  }, { status: 201 });
}
