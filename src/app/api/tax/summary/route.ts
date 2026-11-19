import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type RowType = 'section' | 'data' | 'total' | 'final';

interface TaxRow {
  id: string;
  type: RowType;
  sectionId?: string;
  name: string;
  formLine?: string;
  amount?: string;
  ytd?: string;
  category?: 'income' | 'deductions' | 'assets';
  kind?: 'mapped' | 'unmapped';
  mapping?: string;
  accountId?: string;
}

/** GET /api/tax/summary?year=2026 — the Tax Summary table, built live:
 *  GL accounts grouped into Income / COGS / Operating expenses /
 *  Business assets (fixed assets), with current-month activity (amount)
 *  and year-to-date activity (ytd) from posted/reversed journal lines,
 *  signed by account type. An account is mapped when it carries a
 *  tax_category_id; otherwise it is unmapped. Totals + taxable profit
 *  (income − COGS − operating) + 21% federal estimate.
 *  Only accounts with activity in the year (or a mapping) appear —
 *  zero-activity unmapped accounts have nothing to map. */
export async function GET(req: NextRequest) {
  try {
    const year = Number(new URL(req.url).searchParams.get('year') || new Date().getFullYear());
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return err('VALIDATION', 'year is required (e.g. 2026).');
    const sb = supabaseAdmin();
    const now = new Date();
    const periodStart = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const periodEnd = new Date(year, now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // PostgREST caps every page at 1,000 rows server-side (verified live:
    // limit=10000 returned Content-Range 0-999/1250), so the journal-lines
    // fetch pages in 1,000-row ranges ordered by id until a short page
    // arrives. Without this the summary silently drops the newest lines
    // once the book passes 1,000 (the /api/reports oracle had the same
    // bug — 5100 showed -720 instead of -14,400).
    const PAGE = 1000;
    async function fetchLines(): Promise<Record<string, unknown>[]> {
      const out: Record<string, unknown>[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await sb.from('acct_journal_lines')
          .select('account_id, debit, credit, acct_journal_entries!inner(status, entry_date)')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('acct_journal_entries.status', ['posted', 'reversed'])
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as Record<string, unknown>[];
        out.push(...page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      return out;
    }
    const [{ data: accounts, error: acctErr }, { data: cats }, lines] = await Promise.all([
      sb.from('acct_chart_of_accounts')
        .select('id, code, name, account_type, subtype, is_active, tax_category_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('is_active', true)
        .order('code'),
      sb.from('acct_tax_categories').select('id, code, name, description').eq('tenant_id', DEFAULT_TENANT_ID).order('code'),
      fetchLines(),
    ]);
    if (acctErr) return err('SUMMARY_FAILED', acctErr.message, 500);

    const catById = new Map((cats || []).map((c) => [String(c.id), c as Record<string, unknown>]));

    // Net activity per account: revenue is credit − debit, everything else debit − credit.
    const activity = new Map<string, { period: number; ytd: number }>();
    for (const l of (lines || []) as Record<string, unknown>[]) {
      const entry = l.acct_journal_entries as { entry_date?: string } | null;
      const date = String(entry?.entry_date || '');
      if (!date || date < yearStart || date > yearEnd) continue;
      const net = Number(l.debit || 0) - Number(l.credit || 0);
      const cur = activity.get(String(l.account_id)) ?? { period: 0, ytd: 0 };
      cur.ytd += net;
      if (date >= periodStart && date <= periodEnd) cur.period += net;
      activity.set(String(l.account_id), cur);
    }

    const sign = (a: Record<string, unknown>) =>
      String(a.account_type) === 'revenue' ? -1 : 1;

    const sections: { id: string; name: string; category: 'income' | 'deductions' | 'assets'; match: (a: Record<string, unknown>) => boolean }[] = [
      { id: 'sec-income', name: 'Income', category: 'income', match: (a) => String(a.account_type) === 'revenue' },
      { id: 'sec-cogs', name: 'Cost of goods sold', category: 'deductions', match: (a) => String(a.account_type) === 'expense' && String(a.subtype) === 'cogs' },
      { id: 'sec-operating', name: 'Operating expenses', category: 'deductions', match: (a) => String(a.account_type) === 'expense' && String(a.subtype) !== 'cogs' },
      { id: 'sec-assets', name: 'Business assets', category: 'assets', match: (a) => String(a.account_type) === 'asset' && String(a.subtype) === 'fixed_asset' },
    ];

    const rows: TaxRow[] = [];
    const sectionTotals: Record<string, { period: number; ytd: number }> = {};
    const unmapped: { id: string; name: string; type: string }[] = [];
    let mappedCount = 0;
    let mappableCount = 0;

    for (const sec of sections) {
      const members = ((accounts || []) as Record<string, unknown>[]).filter(sec.match);
      const shown = members.filter((a) => {
        const act = activity.get(String(a.id));
        const hasActivity = act != null && (act.ytd !== 0 || act.period !== 0);
        return hasActivity || a.tax_category_id != null;
      });
      if (shown.length === 0) continue;
      rows.push({ id: sec.id, type: 'section', sectionId: sec.id, name: sec.name });
      let pTot = 0;
      let yTot = 0;
      for (const a of shown) {
        const act = activity.get(String(a.id)) ?? { period: 0, ytd: 0 };
        const s = sign(a);
        const period = s * act.period;
        const ytd = s * act.ytd;
        pTot += period;
        yTot += ytd;
        const cat = a.tax_category_id != null ? catById.get(String(a.tax_category_id)) : undefined;
        mappableCount += 1;
        if (cat) mappedCount += 1;
        else unmapped.push({ id: String(a.id), name: String(a.name), type: String(a.account_type) });
        rows.push({
          id: `d-${String(a.id)}`,
          type: 'data',
          sectionId: sec.id,
          name: String(a.name),
          formLine: cat ? String(cat.description || cat.name) : 'Needs tax line mapping',
          amount: money(period),
          ytd: money(ytd),
          category: sec.category,
          kind: cat ? 'mapped' : 'unmapped',
          mapping: cat ? String(cat.name) : undefined,
          accountId: String(a.id),
        });
      }
      sectionTotals[sec.id] = { period: pTot, ytd: yTot };
      rows.push({
        id: `t-${sec.id}`,
        type: 'total',
        sectionId: sec.id,
        name: `Total ${sec.name.toLowerCase()}`,
        amount: money(pTot),
        ytd: money(yTot),
      });
    }

    const income = sectionTotals['sec-income'] ?? { period: 0, ytd: 0 };
    const cogs = sectionTotals['sec-cogs'] ?? { period: 0, ytd: 0 };
    const operating = sectionTotals['sec-operating'] ?? { period: 0, ytd: 0 };
    const taxablePeriod = income.period - cogs.period - operating.period;
    const taxableYtd = income.ytd - cogs.ytd - operating.ytd;
    rows.push({
      id: 'f-final',
      type: 'final',
      name: 'Taxable profit (before estimated tax)',
      amount: money(taxablePeriod),
      ytd: money(taxableYtd),
    });

    return NextResponse.json({
      data: rows,
      meta: {
        year,
        periodLabel: `${now.toLocaleString('en-US', { month: 'long' })} ${year}`,
        taxableProfit: { period: taxablePeriod, ytd: taxableYtd },
        estFederalTax: { period: Math.max(0, taxablePeriod * 0.21), ytd: Math.max(0, taxableYtd * 0.21) },
        mappable: mappableCount,
        mapped: mappedCount,
        unmappedCount: mappableCount - mappedCount,
        unmapped,
        categories: (cats || []).map((c) => ({
          id: String(c.id),
          code: String(c.code),
          name: String(c.name),
          description: String(c.description || ''),
        })),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to build tax summary.';
    return err('SUMMARY_FAILED', message, 500);
  }
}
