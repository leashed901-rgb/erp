import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { TABLE_REGISTRY } from '@/lib/tableRegistry';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

type Row = Record<string, string | number>;
type Loader = () => Promise<Row[]>;

const money = (n: number) =>
  (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

/** One erp_orders row shaped for the holds / order-issues lists. */
function orderIssueRow(o: Record<string, any>): Row {
  const meta = (o.metadata || {}) as Record<string, unknown>;
  return {
    id: o.id,
    order: o.order_number || '—',
    customer: (meta.customer_name as string) || (o.customer_email ? String(o.customer_email).split('@')[0] : '—'),
    channel: o.marketplace_name || o.sales_channel || '—',
    date: fmtDate(o.order_date),
    total: money(Number(o.total || 0)),
    status: o.on_hold ? 'On hold' : o.needs_attention ? 'Needs attention' : cap(String(o.status || '').replace(/_/g, ' ')),
    issue: o.needs_attention ? (o.attention_reason || 'Needs attention') : o.on_hold ? (o.hold_reason || 'On hold') : '—',
  };
}
const monthYear = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/** Party display names live in platform_parties.metadata->name. */
async function partyNames() {
  const { data } = await supabaseAdmin().from('platform_parties').select('id, metadata').eq('tenant_id', DEFAULT_TENANT_ID);
  return new Map((data || []).map((p: { id: string; metadata?: { name?: string } }) => [p.id, p.metadata?.name || '—']));
}

/** Product names for a list of product ids (chunked .in() ≤100). */
async function productNames(ids: string[]) {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await supabaseAdmin().from('products').select('id, name, title').in('id', uniq.slice(i, i + 100));
    for (const p of data || []) out.set(p.id, p.name || p.title || String(p.id).slice(0, 8));
  }
  return out;
}

/** ERP SKU codes for a list of sku ids (erp_product_skus). */
async function skuCodes(ids: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin().from('erp_product_skus').select('id, sku').in('id', ids.slice(i, i + 100));
    for (const s of data || []) out.set(s.id, s.sku || String(s.id).slice(0, 8));
  }
  return out;
}

/** Warehouse names for a list of warehouse ids. */
async function warehouseNames(ids: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin().from('erp_warehouses').select('id, name, code').in('id', ids.slice(i, i + 100));
    for (const w of data || []) out.set(w.id, w.name || w.code || String(w.id).slice(0, 8));
  }
  return out;
}

async function accountNames() {
  const { data } = await supabaseAdmin().from('acct_chart_of_accounts').select('id, code, name').eq('tenant_id', DEFAULT_TENANT_ID);
  return new Map((data || []).map((a: { id: string; code: string; name: string }) => [a.id, `${a.code} · ${a.name}`]));
}

async function skuNames(ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await supabaseAdmin().from('erp_product_skus').select('id, sku').in('id', ids.slice(0, 500));
  for (const r of data || []) map.set(r.id, r.sku || r.id);
  return map;
}

async function bankNames() {
  const { data } = await supabaseAdmin().from('acct_bank_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID);
  return new Map((data || []).map((a: { id: string; name: string }) => [a.id, a.name]));
}

/** Tax jurisdiction names (id → name or code). */
async function jurisdictionNames() {
  const { data } = await supabaseAdmin().from('acct_tax_jurisdictions').select('id, code, name').eq('tenant_id', DEFAULT_TENANT_ID);
  return new Map((data || []).map((j: { id: string; code: string; name: string }) => [j.id, j.name || j.code]));
}

/** A stored fraction rate (0.07) as a display percent ("7%", "6.25%"). */
const pct = (r: number) => `${Number(((Number(r) || 0) * 100).toFixed(2))}%`;

/** Channel listings: commerce_channel_products joined to its channel and
 *  its catalog item. `channelSlug` narrows to one channel (matched on
 *  code or slugified name); without it, every channel's listings. */
async function loadChannelListings(channelSlug?: string): Promise<Row[]> {
  const [{ data: channels }, { data: listings }] = await Promise.all([
    supabaseAdmin().from('commerce_order_channels').select('id, code, name').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
    supabaseAdmin().from('commerce_channel_products').select('id, channel_id, catalog_item_id, published, sync_status, last_synced_at').eq('tenant_id', DEFAULT_TENANT_ID).order('last_synced_at', { ascending: false, nullsFirst: false }).limit(200),
  ]);
  const channelById = new Map((channels || []).map(c => [c.id, c]));
  const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let channelIds: Set<string> | null = null;
  if (channelSlug) {
    channelIds = new Set(
      (channels || [])
        .filter(c => String(c.code || '').toLowerCase() === channelSlug || slugify(String(c.name || '')) === channelSlug)
        .map(c => c.id),
    );
  }
  const itemIds = [...new Set((listings || []).map(l => l.catalog_item_id).filter(Boolean))] as string[];
  const itemById = new Map<string, { name: string; sku: string }>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data } = await supabaseAdmin().from('commerce_catalog_items').select('id, name, sku').eq('tenant_id', DEFAULT_TENANT_ID).in('id', itemIds.slice(i, i + 100));
    for (const it of data || []) itemById.set(it.id, { name: it.name || '—', sku: it.sku || '—' });
  }
  const syncLabel = (s: string) => {
    const v = String(s || 'pending').toLowerCase();
    return v === 'synced' ? 'Synced' : v === 'syncing' ? 'Syncing' : v === 'failed' ? 'Failed' : v === 'pending' ? 'Pending' : v === 'out_of_sync' ? 'Out of sync' : v === 'disabled' ? 'Disabled' : cap(v.replace(/_/g, ' '));
  };
  return (listings || [])
    .filter(l => !channelIds || channelIds.has(l.channel_id))
    .map(l => {
      const ch = channelById.get(l.channel_id) as { name?: string } | undefined;
      const item = itemById.get(l.catalog_item_id);
      return {
        id: l.id,
        product: item?.name || '—',
        sku: item?.sku || '—',
        channel: ch?.name || '—',
        status: syncLabel(l.sync_status),
        published: l.published ? 'Yes' : 'No',
        lastSynced: fmtDate(l.last_synced_at),
      };
    });
}

/**
 * GET /api/list-rows?screen=<key>
 *
 * Live rows for the generic ListView screens (ScreenContent falls back to
 * ListScreen for any screen without a dedicated component). Each mapping
 * returns DemoRow-shaped records whose keys match the screen's SCREEN_DEFS
 * columns. Screens with no mapping here answer 404 and the list renders
 * its honest empty state — a missing mapping is never papered over with
 * invented rows.
 */

async function feedRows(slug: string) {
  const sb = supabaseAdmin();
  const { data: sup } = await sb.from('suppliers').select('id').eq('slug', slug).maybeSingle();
  if (!sup) return [];
  const { data } = await sb.from('supplier_catalog_products').select('name, brand_name, source_category_path, variant_count').eq('supplier_id', sup.id).order('name').limit(200);
  return (data || []).map(pr => ({ name: pr.name || '—', brand: pr.brand_name || '—', category: pr.source_category_path || '—', variants: pr.variant_count ?? '—' }));
}


async function kbRows() {
  const { data } = await supabaseAdmin().from('support_kb_articles').select('id, title, collection, status').eq('tenant_id', DEFAULT_TENANT_ID).order('title').limit(200);
  return (data || []).map(a => ({ id: a.id, name: a.title || '—', slug: a.collection || '—', status: cap(String(a.status || '')) }));
}

const SCREEN_TABLES: Record<string, string> = {
  'contracts': 'acct_revenue_contracts',
  'terms': 'cms_pages',
  'cms-pages': 'cms_pages',
  'website-cms': 'cms_pages',
  'banners': 'cms_banners',
  'popups': 'cms_popups',
  'content-blocks': 'cms_content_blocks',
  'navigation': 'cms_navigation_menus',
  'media': 'cms_media_assets',
  'pricing-tiers': 'commerce_price_lists',
  'compliance-1099': 'acct_payroll_tax_forms',
  'set-kpi-targets': 'platform_kpi_targets',
  'set-report-dashboards': 'platform_dashboards',
  'set-dashboards': 'platform_dashboards',
  'set-categories-tags': 'categories',
  'set-sla-policies': 'support_sla_policies',
  'set-automation-rules': 'crm_automation_workflows',
  'set-segments-lists': 'crm_segments',
  'set-lead-capture': 'platform_webforms',
  'set-newsletter-email': 'crm_campaigns',
  'set-publishing-queue': 'social_posts',
  'set-ad-center': 'ad_campaigns',
  'catalog-items': 'products',
  'listings': 'products',
  'blanks': 'canonical_products',
  'bundles': 'catalog_bundles',
  'set-products-bundles': 'catalog_bundles',
  'onboarding-requests': 'sellers',
  'onboarding-approvals': 'sellers',
  'order-issues': 'erp_orders',
  'order-detail': 'erp_orders',
};

const LOADERS: Record<string, Loader> = {


  // ── Catalog items: the storefront catalog (products + category
  // join + variant price range, mirroring /api/products). ──
  'catalog-items': async () => {
    const { data } = await supabaseAdmin().from('products').select('id, name, brand, status, fulfillment_type, categories(name)').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    const rows = (data || []) as unknown as { id: string; name: string; brand: string | null; status: string; fulfillment_type: string | null; categories: { name: string } | null }[];
    const priceMin = new Map<string, number>();
    const ids = rows.map(r => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      let offset = 0;
      for (;;) {
        const { data: vars } = await supabaseAdmin().from('product_variants').select('product_id, price').eq('tenant_id', DEFAULT_TENANT_ID).in('product_id', chunk).order('product_id').range(offset, offset + 999);
        if (!vars || !vars.length) break;
        for (const v of vars as { product_id: string; price: number | null }[]) {
          if (v.price == null) continue;
          const cur = priceMin.get(v.product_id);
          if (cur == null || Number(v.price) < cur) priceMin.set(v.product_id, Number(v.price));
        }
        if (vars.length < 1000) break;
        offset += 1000;
      }
    }
    return rows.map(pr => ({
      id: pr.id, name: pr.name || '—',
      supplier: pr.brand || '—',
      category: pr.categories?.name || '—',
      price: priceMin.has(pr.id) ? money(priceMin.get(pr.id) as number) : '—',
      status: cap(String(pr.status || '').replace(/_/g, ' ')),
    }));
  },


  // ── Blanks: the canonical products the Design Studio designs on. ──
  blanks: async () => {
    const { data } = await supabaseAdmin().from('canonical_products').select('id, sku_slug, name, category, render_state').order('name').limit(200);
    return (data || []).map(c => ({
      id: c.id,
      name: String(c.name || '—').trim(),
      sku: c.sku_slug || '—',
      category: c.category || '—',
      status: cap(String(c.render_state || '').replace(/_/g, ' ')),
    }));
  },

  // ── Catalog review: canonical products not yet render-ready. ──
  'catalog-review': async () => {
    const { data } = await supabaseAdmin().from('canonical_products').select('id, sku_slug, name, category, render_state, created_at').neq('render_state', 'ready').order('created_at', { ascending: false }).limit(200);
    return (data || []).map(c => ({
      id: c.id,
      name: String(c.name || '—').trim(),
      sku: c.sku_slug || '—',
      category: c.category || '—',
      issue: c.render_state === 'missing_assets' ? 'Missing assets' : c.render_state === 'unverified' ? 'Unverified' : cap(String(c.render_state || '').replace(/_/g, ' ')),
      status: 'Needs review',
    }));
  },


  // ── Entities: one row per legal entity; books = acct_books count. ──
  entities: async () => {
    const [{ data: entities }, { data: books }] = await Promise.all([
      supabaseAdmin().from('acct_entities').select('id, legal_name, display_name, functional_currency, fiscal_year_start_month, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('legal_name'),
      supabaseAdmin().from('acct_books').select('entity_id').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const bookCount = new Map<string, number>();
    for (const b of books || []) bookCount.set(b.entity_id, (bookCount.get(b.entity_id) || 0) + 1);
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (entities || []).map(e => ({
      name: e.display_name || e.legal_name || '—',
      books: String(bookCount.get(e.id) || 0),
      currency: e.functional_currency || '—',
      fiscal: months[Number(e.fiscal_year_start_month) || 0] || '—',
      members: '—',
      status: e.is_active ? 'Active' : 'Inactive',
    }));
  },

  // ── Expenses: spend transactions + bills (the def's subtitle promises
  // both). Tab status is the transaction kind, not the approval state. ──
  expenses: async () => {
    const names = await partyNames();
    const accounts = await accountNames();
    const banks = await bankNames();
    const [{ data: spends }, { data: spendLines }, { data: bills }, { data: billLines }] = await Promise.all([
      supabaseAdmin().from('acct_spend_transactions').select('id, txn_kind, payee_vendor_id, payee_customer_id, payee_name, bank_account_id, payment_date, payment_method, total, status').eq('tenant_id', DEFAULT_TENANT_ID).order('payment_date', { ascending: false }).limit(200),
      supabaseAdmin().from('acct_spend_lines').select('spend_id, account_id').eq('tenant_id', DEFAULT_TENANT_ID).limit(2000),
      supabaseAdmin().from('acct_ap_bills').select('id, vendor_id, bill_number, bill_date, total, status').eq('tenant_id', DEFAULT_TENANT_ID).order('bill_date', { ascending: false }).limit(200),
      supabaseAdmin().from('acct_ap_bill_lines').select('bill_id, expense_account_id').eq('tenant_id', DEFAULT_TENANT_ID).limit(2000),
    ]);
    const spendCat = new Map<string, string>();
    for (const l of spendLines || []) if (!spendCat.has(l.spend_id)) spendCat.set(l.spend_id, accounts.get(l.account_id) || '—');
    const billCat = new Map<string, string>();
    for (const l of billLines || []) if (!billCat.has(l.bill_id)) billCat.set(l.bill_id, accounts.get(l.expense_account_id) || '—');
    const rows: Row[] = [];
    for (const s of spends || []) {
      const kind = s.txn_kind === 'check' ? 'Checks' : s.txn_kind === 'cc_credit' ? 'Credits' : 'Expenses';
      rows.push({
        date: fmtDate(s.payment_date),
        payee: s.payee_name || names.get(s.payee_vendor_id) || names.get(s.payee_customer_id) || '—',
        category: spendCat.get(s.id) || '—',
        paid: banks.get(s.bank_account_id) || s.payment_method || '—',
        amount: money(Number(s.total || 0)),
        receipt: '—',
        status: kind,
      });
    }
    for (const b of bills || []) {
      rows.push({
        date: fmtDate(b.bill_date),
        payee: names.get(b.vendor_id) || '—',
        category: billCat.get(b.id) || '—',
        paid: '—',
        amount: money(Number(b.total || 0)),
        receipt: '—',
        status: 'Bills',
      });
    }
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return rows;
  },

  // ── Contractors: a contractor here is a 1099 vendor
  // (acct_vendors.is_1099_vendor) + W-9/invite state + YTD paid. The party
  // spine only carries 'contractor' in metadata.roles after a W-9 invite,
  // so filtering on it returns nothing for vendors who never got one. ──
  contractors: async () => {
    const names = await partyNames();
    const year = new Date().getFullYear();
    const [{ data: vendors }, { data: invites }, { data: payments }, { data: thresholds }] = await Promise.all([
      supabaseAdmin().from('acct_vendors').select('id, is_1099_vendor, w9_received_at').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_1099_vendor', true),
      supabaseAdmin().from('acct_contractor_invites').select('vendor_id, status, sent_at').eq('tenant_id', DEFAULT_TENANT_ID).order('sent_at', { ascending: false }),
      supabaseAdmin().from('acct_ap_payments').select('vendor_id, amount, payment_date').eq('tenant_id', DEFAULT_TENANT_ID).is('voided_at', null).gte('payment_date', `${year}-01-01`),
      supabaseAdmin().from('acct_1099_thresholds').select('amount_threshold, tax_year_to').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_year_to', { ascending: false }).limit(1),
    ]);
    const vendorById = new Map((vendors || []).map(v => [v.id, v]));
    const ids = [...vendorById.keys()];
    const latestInvite = new Map<string, string>();
    for (const inv of invites || []) if (!latestInvite.has(inv.vendor_id)) latestInvite.set(inv.vendor_id, inv.status);
    const ytd = new Map<string, number>();
    for (const p of payments || []) ytd.set(p.vendor_id, (ytd.get(p.vendor_id) || 0) + Number(p.amount || 0));
    const threshold = Number(thresholds?.[0]?.amount_threshold || 600);
    return ids.map(id => {
      const v = vendorById.get(id) as { w9_received_at?: string | null } | undefined;
      const invite = latestInvite.get(id);
      const paid = ytd.get(id) || 0;
      return {
        name: names.get(id) || '—',
        invite: v?.w9_received_at ? 'Completed' : invite && ['sent', 'opened'].includes(invite) ? 'Invited' : 'Not invited',
        w9: v?.w9_received_at ? 'Yes' : 'No',
        paid: money(paid),
        status: paid >= threshold ? 'Met' : 'Not met',
      };
    });
  },

  // ── 1099s: 1099 vendors, YTD paid vs the filing threshold. ──
  '1099s': async () => {
    const names = await partyNames();
    const year = new Date().getFullYear();
    const [{ data: vendors }, { data: payments }, { data: thresholds }] = await Promise.all([
      supabaseAdmin().from('acct_vendors').select('id, is_1099_vendor, w9_received_at').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_1099_vendor', true),
      supabaseAdmin().from('acct_ap_payments').select('vendor_id, amount, payment_date').eq('tenant_id', DEFAULT_TENANT_ID).is('voided_at', null).gte('payment_date', `${year}-01-01`),
      supabaseAdmin().from('acct_1099_thresholds').select('amount_threshold, tax_year_to').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_year_to', { ascending: false }).limit(1),
    ]);
    const ytd = new Map<string, number>();
    for (const p of payments || []) ytd.set(p.vendor_id, (ytd.get(p.vendor_id) || 0) + Number(p.amount || 0));
    const threshold = Number(thresholds?.[0]?.amount_threshold || 600);
    return (vendors || []).map(v => {
      const paid = ytd.get(v.id) || 0;
      return {
        vendor: names.get(v.id) || '—',
        ytd: money(paid),
        threshold: money(threshold),
        w9: v.w9_received_at ? 'Yes' : 'No',
        status: paid >= threshold ? 'Meets threshold' : 'Below threshold',
      };
    });
  },

  // ── Disputes: chargebacks; tab status from the dispute state. ──
  disputes: async () => {
    const { data } = await supabaseAdmin().from('acct_disputes').select('opened_on, created_at, processor, amount, reason, evidence_due_at, status').eq('tenant_id', DEFAULT_TENANT_ID).order('opened_on', { ascending: false }).limit(200);
    const mapStatus = (s: string) => {
      const v = String(s || '').toLowerCase();
      if (v === 'won') return 'Won';
      if (v === 'lost') return 'Lost';
      if (['action_needed', 'needs_evidence', 'evidence_needed', 'open'].includes(v)) return 'Action needed';
      return 'Under review';
    };
    return (data || []).map(d => ({
      opened: fmtDate(d.opened_on || d.created_at),
      processor: d.processor || '—',
      amount: money(Number(d.amount || 0)),
      reason: d.reason || '—',
      due: fmtDate(d.evidence_due_at),
      status: mapStatus(d.status),
    }));
  },

  // ── Payouts: a payout is "Matched" once it has a GL journal (matched
  // to a bank deposit); otherwise it sits in clearing. ──
  payouts: async () => {
    const { data } = await supabaseAdmin().from('acct_payouts').select('scheduled_for, period_start, provider, gross_amount, fee_amount, refund_amount, net_amount, gl_journal_entry_id').eq('tenant_id', DEFAULT_TENANT_ID).order('scheduled_for', { ascending: false }).limit(200);
    return (data || []).map(p => ({
      date: fmtDate(p.scheduled_for || p.period_start),
      processor: p.provider || '—',
      gross: money(Number(p.gross_amount || 0)),
      fees: money(Number(p.fee_amount || 0)),
      refunds: money(Number(p.refund_amount || 0)),
      net: money(Number(p.net_amount || 0)),
      status: p.gl_journal_entry_id ? 'Matched' : 'In clearing',
    }));
  },

  // ── Payroll runs: "Posted" once a GL journal exists; otherwise the
  // run state maps to Draft / Approved / Paid. ──
  payroll: async () => {
    const { data } = await supabaseAdmin().from('acct_payroll_runs').select('run_number, status, gross_total, net_total, employee_tax_total, employer_tax_total, processed_at, created_at, gl_journal_entry_id').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(r => {
      const status = r.gl_journal_entry_id ? 'Posted'
        : ['paid', 'submitted'].includes(String(r.status)) ? 'Paid'
        : r.status === 'approved' ? 'Approved' : 'Draft';
      return {
        period: monthYear(r.created_at),
        status,
        payDate: fmtDate(r.processed_at),
        gross: money(Number(r.gross_total || 0)),
        taxes: money(Number(r.employee_tax_total || 0) + Number(r.employer_tax_total || 0)),
        net: money(Number(r.net_total || 0)),
      };
    });
  },

  // ── Refunds: acct_refunds with the customer name and the invoice or
  // order it reverses. ──
  refunds: async () => {
    const names = await partyNames();
    const [{ data: refunds }, { data: invoices }] = await Promise.all([
      supabaseAdmin().from('acct_refunds').select('customer_id, invoice_id, order_ref, refund_type, reason, amount, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200),
      supabaseAdmin().from('acct_ar_invoices').select('id, invoice_number').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const invNo = new Map((invoices || []).map(i => [i.id, i.invoice_number]));
    const mapStatus = (s: string) => {
      const v = String(s || '').toLowerCase();
      if (v === 'pending_approval' || v === 'pending') return 'Pending approval';
      if (v === 'posted') return 'Posted';
      return cap(v.replace(/_/g, ' '));
    };
    return (refunds || []).map(r => ({
      date: fmtDate(r.created_at),
      customer: names.get(r.customer_id) || '—',
      source: (r.invoice_id && invNo.get(r.invoice_id)) || r.order_ref || '—',
      amount: money(Number(r.amount || 0)),
      type: r.refund_type || '—',
      reason: r.reason || '—',
      status: mapStatus(r.status),
    }));
  },

  // ── Subscriptions: one row per plan, subscribers = live subscriptions
  // on that plan. No failed-payments table exists — that cell is '—'. ──
  subscriptions: async () => {
    const [{ data: subs }, { data: plans }] = await Promise.all([
      supabaseAdmin().from('commerce_subscriptions').select('plan_id, status, billing_interval, interval_count, next_billing_date').eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin().from('subscription_plans').select('id, name').eq('active', true),
    ]);
    const planName = new Map((plans || []).map(p => [p.id, p.name]));
    const byPlan = new Map<string, { count: number; next: string | null; active: boolean; cycle: string }>();
    for (const s of subs || []) {
      const cur = byPlan.get(s.plan_id) || { count: 0, next: null, active: false, cycle: '—' };
      cur.count += 1;
      if (s.status === 'active') cur.active = true;
      if (s.next_billing_date && (!cur.next || s.next_billing_date < cur.next)) cur.next = s.next_billing_date;
      if (cur.cycle === '—' && s.billing_interval) cur.cycle = `${Number(s.interval_count || 1) > 1 ? `${s.interval_count} × ` : ''}${s.billing_interval}`;
      byPlan.set(s.plan_id, cur);
    }
    return [...byPlan.entries()].map(([planId, v]) => ({
      plan: planName.get(planId) || '—',
      subscribers: v.count,
      cycle: v.cycle,
      next: fmtDate(v.next),
      failed: '—',
      status: v.active ? 'Active' : 'Paused',
    }));
  },

  // ── Bill approval setup: the approval chain rows with the document
  // number and the approver's name. ──
  'bill-approval-setup': async () => {
    const names = await partyNames();
    const [{ data: approvals }, { data: bills }, { data: pos }] = await Promise.all([
      supabaseAdmin().from('acct_ap_approvals').select('bill_id, purchase_order_id, approver_id, sequence_no, status, acted_at, stage').eq('tenant_id', DEFAULT_TENANT_ID).order('sequence_no'),
      supabaseAdmin().from('acct_ap_bills').select('id, bill_number').eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin().from('erp_purchase_orders').select('id, po_number').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const billNo = new Map((bills || []).map(b => [b.id, b.bill_number]));
    const poNo = new Map((pos || []).map(p => [p.id, p.po_number]));
    return (approvals || []).map(a => ({
      document: (a.bill_id && billNo.get(a.bill_id)) || (a.purchase_order_id && poNo.get(a.purchase_order_id)) || '—',
      approver: names.get(a.approver_id) || '—',
      stage: a.stage || '—',
      sequence: a.sequence_no ?? '—',
      status: cap(String(a.status || '').replace(/_/g, ' ')),
      acted: fmtDate(a.acted_at),
    }));
  },

  // ── Sales channels: commerce channels on file (tenant has none — the
  // empty state is the honest answer). ──
  'sales-channels': async () => {
    const { data } = await supabaseAdmin().from('commerce_order_channels').select('name, channel_type, active, code').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
    return (data || []).map(c => ({
      channel: c.name || '—',
      type: c.channel_type || '—',
      active: c.active ? 'Active' : 'Inactive',
      code: c.code || '—',
    }));
  },

  // ── Gift cards: live balances; customer by party or issue email. ──
  'gift-cards': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('acct_gift_cards').select('code, kind, status, initial_amount, balance, customer_id, issued_to_email, expires_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(g => ({
      code: g.code || '—',
      kind: g.kind || '—',
      status: cap(String(g.status || '').replace(/_/g, ' ')),
      initial: money(Number(g.initial_amount || 0)),
      balance: money(Number(g.balance || 0)),
      customer: names.get(g.customer_id) || g.issued_to_email || '—',
      expires: fmtDate(g.expires_at),
    }));
  },

  // ── Liabilities and credit: credit-card / loan / credit-line bank
  // accounts — the table that carries credit_limit and APR. The tenant
  // has none, so this is honestly empty until one is added. ──
  'liabilities-credit': async () => {
    const { data } = await supabaseAdmin().from('acct_bank_accounts').select('id, name, institution_name, account_kind, credit_limit, payment_due_day, is_active, gl_account_id').eq('tenant_id', DEFAULT_TENANT_ID).in('account_kind', ['credit_card', 'loan', 'credit_line']).order('name');
    const rows: Row[] = [];
    for (const a of data || []) {
      let balance = 0;
      if (a.gl_account_id) {
        const { data: bal } = await supabaseAdmin().rpc('acct_account_balance', { p_account_id: a.gl_account_id });
        balance = Number(bal || 0);
      }
      rows.push({
        account: a.name || '—',
        institution: a.institution_name || '—',
        kind: String(a.account_kind || '').replace(/_/g, ' '),
        limit: a.credit_limit != null ? money(Number(a.credit_limit)) : '—',
        balance: money(balance),
        due: a.payment_due_day ? `Day ${a.payment_due_day}` : '—',
        status: a.is_active ? 'Active' : 'Inactive',
      });
    }
    return rows;
  },

  // ── Tax income: posted journal lines on revenue accounts, current
  // year — the same activity the Tax Summary aggregates. ──
  'tax-income': async () => {
    const year = new Date().getFullYear();
    const accounts = await accountNames();
    const [{ data: entries }, { data: revAccounts }] = await Promise.all([
      supabaseAdmin().from('acct_journal_entries').select('id, entry_date, memo').eq('tenant_id', DEFAULT_TENANT_ID).in('status', ['posted', 'reversed']).gte('entry_date', `${year}-01-01`).order('entry_date', { ascending: false }).limit(500),
      supabaseAdmin().from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('account_type', 'revenue'),
    ]);
    const entryById = new Map((entries || []).map(e => [e.id, e]));
    const rev = new Set((revAccounts || []).map(a => a.id));
    // Scope the lines fetch to the entries just read: an unbounded
    // .limit(5000) is clamped to 1,000 rows server-side by PostgREST and
    // silently drops the newest lines once the book passes 1,000.
    // Id lists are chunked to 100 — a .in() with 400+ ids silently fails.
    const entryIds = [...entryById.keys()] as string[];
    const linePages: { journal_entry_id: string; account_id: string; debit: number; credit: number; description: string | null }[] = [];
    for (let i = 0; i < entryIds.length; i += 100) {
      const { data: page } = await supabaseAdmin().from('acct_journal_lines').select('journal_entry_id, account_id, debit, credit, description').eq('tenant_id', DEFAULT_TENANT_ID).in('journal_entry_id', entryIds.slice(i, i + 100)).limit(5000);
      linePages.push(...((page || []) as { journal_entry_id: string; account_id: string; debit: number; credit: number; description: string | null }[]));
    }
    const lines = linePages;
    return (lines || [])
      .filter(l => rev.has(l.account_id) && entryById.has(l.journal_entry_id))
      .sort((a, b) => String(entryById.get(b.journal_entry_id)?.entry_date || '').localeCompare(String(entryById.get(a.journal_entry_id)?.entry_date || '')))
      .slice(0, 200)
      .map(l => {
        const e = entryById.get(l.journal_entry_id) as { entry_date: string; memo?: string };
        return {
          date: fmtDate(e.entry_date),
          account: accounts.get(l.account_id) || '—',
          description: l.description || e.memo || '—',
          amount: money(Number(l.credit || 0) - Number(l.debit || 0)),
        };
      });
  },

  // ── Depreciable business assets. ──
  'tax-assets': async () => {
    const { data } = await supabaseAdmin().from('acct_fixed_assets').select('name, placed_in_service_date, original_cost, accumulated_depreciation, status').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
    return (data || []).map(a => ({
      asset: a.name || '—',
      placed: fmtDate(a.placed_in_service_date),
      cost: money(Number(a.original_cost || 0)),
      depreciation: money(Number(a.accumulated_depreciation || 0)),
      book: money(Number(a.original_cost || 0) - Number(a.accumulated_depreciation || 0)),
      status: cap(String(a.status || '').replace(/_/g, ' ')),
    }));
  },

  // ── 1099-K detail: generated 1099-K rows per seller. ──
  'tax-1099k': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('seller_1099k_generations').select('seller_id, tax_year, gross_amount, transaction_count, basis, filing_status').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_year', { ascending: false }).limit(200);
    return (data || []).map(g => ({
      seller: names.get(g.seller_id) || '—',
      year: String(g.tax_year || '—'),
      gross: money(Number(g.gross_amount || 0)),
      transactions: g.transaction_count ?? '—',
      basis: g.basis || '—',
      status: cap(String(g.filing_status || '').replace(/_/g, ' ')),
    }));
  },

  // ── Payroll tax: filed payroll tax forms. ──
  'payroll-tax': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('acct_payroll_tax_forms').select('form_type, tax_year, period_label, status, filed_at, confirmation_number, employee_id, vendor_id').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_year', { ascending: false }).limit(200);
    return (data || []).map(f => ({
      form: f.form_type || '—',
      period: f.period_label || String(f.tax_year || '—'),
      year: String(f.tax_year || '—'),
      status: cap(String(f.status || '').replace(/_/g, ' ')),
      filed: fmtDate(f.filed_at),
      confirmation: f.confirmation_number || '—',
    }));
  },


  // ── Reports hub: one loader per report-* screen, each over the
  // module's real tables (the same sources the module screens use). ──
  'report-orders': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number, customer_email, status, total, order_date').eq('tenant_id', DEFAULT_TENANT_ID).order('order_date', { ascending: false }).limit(200);
    return (data || []).map(o => ({ id: o.id, name: o.order_number || '—', customer: o.customer_email || '—', status: cap(String(o.status || '').replace(/_/g, ' ')), total: money(Number(o.total || 0)), date: fmtDate(o.order_date) }));
  },
  'report-invoices': async () => {
    const { data } = await supabaseAdmin().from('acct_ar_invoices').select('invoice_number, status, total, amount_paid, due_date').eq('tenant_id', DEFAULT_TENANT_ID).order('due_date', { ascending: false }).limit(200);
    return (data || []).map(i => ({ name: i.invoice_number || '—', status: cap(String(i.status || '').replace(/_/g, ' ')), total: money(Number(i.total || 0)), paid: money(Number(i.amount_paid || 0)), due: fmtDate(i.due_date) }));
  },
  'report-bills': async () => {
    const { data } = await supabaseAdmin().from('acct_ap_bills').select('bill_number, status, total, amount_paid, due_date').eq('tenant_id', DEFAULT_TENANT_ID).order('due_date', { ascending: false }).limit(200);
    return (data || []).map(b => ({ name: b.bill_number || '—', status: cap(String(b.status || '').replace(/_/g, ' ')), total: money(Number(b.total || 0)), paid: money(Number(b.amount_paid || 0)), due: fmtDate(b.due_date) }));
  },
  'report-customers': async () => {
    const { data } = await supabaseAdmin().from('crm_customers').select('first_name, last_name, company_name, email, lifecycle_status, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('last_name').limit(200);
    return (data || []).map(c => ({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || '—', company: c.company_name || '—', email: c.email || '—', status: c.is_active === false ? 'Inactive' : cap(String(c.lifecycle_status || 'active')) }));
  },
  'report-vendors': async () => {
    const { data } = await supabaseAdmin().from('acct_vendors').select('legal_name, display_name, email, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('legal_name').limit(200);
    return (data || []).map(v => ({ name: v.display_name || v.legal_name || '—', email: v.email || '—', status: v.is_active ? 'Active' : 'Inactive' }));
  },
  'report-suppliers': async () => {
    const { data } = await supabaseAdmin().from('suppliers').select('name, slug, ordering_status').order('name').limit(200);
    return (data || []).map(v => ({ name: v.name || '—', slug: v.slug || '—', status: cap(String(v.ordering_status || '').replace(/_/g, ' ')) }));
  },
  'report-products': async () => {
    const { data } = await supabaseAdmin().from('products').select('name, brand, status, categories(name)').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(pr => ({ name: pr.name || '—', supplier: pr.brand || '—', category: (pr as unknown as { categories: { name: string } | null }).categories?.name || '—', status: cap(String(pr.status || '')) }));
  },
  'report-inventory': async () => {
    const { data } = await supabaseAdmin().from('erp_stock_levels').select('sku_id, warehouse_id, on_hand, reserved').eq('tenant_id', DEFAULT_TENANT_ID).limit(500);
    const agg = new Map<string, { on: number; res: number }>();
    for (const r of data || []) { const a = agg.get(r.sku_id) || { on: 0, res: 0 }; a.on += Number(r.on_hand || 0); a.res += Number(r.reserved || 0); agg.set(r.sku_id, a); }
    const skus = await skuNames([...agg.keys()]);
    return [...agg.entries()].map(([skuId, a]) => ({ name: skus.get(skuId) || skuId, onHand: a.on, reserved: a.res, available: a.on - a.res }));
  },
  'report-returns': async () => {
    const { data } = await supabaseAdmin().from('erp_return_authorizations').select('rma_number, status, reason_code, requested_at').eq('tenant_id', DEFAULT_TENANT_ID).order('requested_at', { ascending: false }).limit(200);
    return (data || []).map(r => ({ name: r.rma_number || '—', status: cap(String(r.status || '').replace(/_/g, ' ')), reason: r.reason_code || '—', requested: fmtDate(r.requested_at) }));
  },
  'report-fulfillment': async () => {
    const { data } = await supabaseAdmin().from('erp_fulfillment_orders').select('fulfillment_number, method, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(f => ({ name: f.fulfillment_number || '—', method: f.method || '—', status: cap(String(f.status || '').replace(/_/g, ' ')), created: fmtDate(f.created_at) }));
  },
  'report-reconcile': async () => {
    const { data } = await supabaseAdmin().from('acct_reconciliations').select('as_of_date, statement_balance, difference, status').eq('tenant_id', DEFAULT_TENANT_ID).order('as_of_date', { ascending: false }).limit(200);
    return (data || []).map(r => ({ name: `Reconciliation · ${fmtDate(r.as_of_date)}`, balance: money(Number(r.statement_balance || 0)), difference: money(Number(r.difference || 0)), status: cap(String(r.status || '').replace(/_/g, ' ')) }));
  },
  'report-tax': async () => {
    const { data } = await supabaseAdmin().from('acct_tax_filings').select('period_label, taxable_sales, tax_collected, tax_remitted, status').eq('tenant_id', DEFAULT_TENANT_ID).order('period_start', { ascending: false }).limit(200);
    return (data || []).map(f => ({ name: f.period_label || '—', sales: money(Number(f.taxable_sales || 0)), collected: money(Number(f.tax_collected || 0)), remitted: money(Number(f.tax_remitted || 0)), status: cap(String(f.status || '')) }));
  },
  'report-tickets': async () => {
    const { data } = await supabaseAdmin().from('support_tickets').select('ticket_ref, subject, status, priority, created_at').eq('tenant_id', DEFAULT_TENANT_ID).is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(t => ({ name: t.ticket_ref || '—', subject: t.subject || '—', status: cap(String(t.status || '')), priority: cap(String(t.priority || '')), created: fmtDate(t.created_at) }));
  },
  'report-sla': async () => {
    const { data } = await supabaseAdmin().from('support_tickets').select('priority, status, first_response_breached_at, resolution_breached_at').eq('tenant_id', DEFAULT_TENANT_ID).is('deleted_at', null).limit(1000);
    const byPriority = new Map<string, { total: number; open: number; breached: number }>();
    for (const t of data || []) { const k = cap(String(t.priority || 'normal')); const a = byPriority.get(k) || { total: 0, open: 0, breached: 0 }; a.total++; if (!['closed', 'resolved'].includes(String(t.status))) a.open++; if (t.first_response_breached_at || t.resolution_breached_at) a.breached++; byPriority.set(k, a); }
    return [...byPriority.entries()].map(([name, a]) => ({ name: `${name} priority`, tickets: a.total, open: a.open, breached: a.breached }));
  },
  'report-trust': async () => {
    const { data } = await supabaseAdmin().from('crm_needs_attention').select('issue, issue_code, severity, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(f => ({ name: f.issue || f.issue_code || '—', severity: cap(String(f.severity || '')), status: cap(String(f.status || 'open')), raised: fmtDate(f.created_at) }));
  },
  'report-leads': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('crm_leads').select('contact_name, email, status, score, party_id, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(l => ({ name: l.contact_name || (l.party_id ? names.get(l.party_id) : null) || '—', email: l.email || '—', status: cap(String(l.status || '').replace(/_/g, ' ')), score: l.score ?? '—' }));
  },
  'report-newsletter': async () => {
    const { data } = await supabaseAdmin().from('crm_campaigns').select('name, campaign_type, status, channel, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(c => ({ name: c.name || '—', type: cap(String(c.campaign_type || '').replace(/_/g, ' ')), channel: c.channel || '—', status: cap(String(c.status || '')) }));
  },
  'report-promotions': async () => {
    const { data } = await supabaseAdmin().from('commerce_promotions').select('code, name, promotion_type, value, usage_count, active').eq('tenant_id', DEFAULT_TENANT_ID).order('code').limit(200);
    return (data || []).map(pr => ({ name: pr.code || '—', title: pr.name || '—', type: cap(String(pr.promotion_type || '').replace(/_/g, ' ')), value: pr.value ?? '—', used: pr.usage_count ?? 0, status: pr.active ? 'Active' : 'Inactive' }));
  },
  'report-social': async () => {
    const { data } = await supabaseAdmin().from('social_posts').select('title, caption, status, scheduled_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(po => ({ name: po.title || (po.caption ? String(po.caption).slice(0, 60) : '—'), status: cap(String(po.status || '')), scheduled: po.scheduled_at ? fmtDate(po.scheduled_at) : '—' }));
  },
  'report-designs': async () => {
    const { data } = await supabaseAdmin().from('designs').select('name, product_type, status, retail_price, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).is('deleted_at', null).order('updated_at', { ascending: false }).limit(200);
    return (data || []).map(d => ({ name: d.name || '—', type: d.product_type || '—', status: cap(String(d.status || '')), price: d.retail_price != null ? money(Number(d.retail_price)) : '—' }));
  },
  'report-cms': async () => {
    const { data } = await supabaseAdmin().from('cms_pages').select('title, slug, page_type, status, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false }).limit(200);
    return (data || []).map(pg => ({ name: pg.title || '—', slug: pg.slug || '—', type: cap(String(pg.page_type || '').replace(/_/g, ' ')), status: cap(String(pg.status || '')) }));
  },
  'report-channels': async () => {
    const { data } = await supabaseAdmin().from('commerce_order_channels').select('code, name, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(c => ({ name: c.name || c.code || '—', code: c.code || '—', status: c.is_active ? 'Active' : 'Inactive' }));
  },
  'report-bundles': async () => {
    const { data } = await supabaseAdmin().from('catalog_bundles').select('name, slug, status, price').order('name').limit(200);
    return (data || []).map(b => ({ name: b.name || '—', slug: b.slug || '—', price: b.price != null ? money(Number(b.price)) : '—', status: cap(String(b.status || '').replace(/_/g, ' ')) }));
  },
  'report-analytics': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('sales_channel, total, status').eq('tenant_id', DEFAULT_TENANT_ID).limit(1000);
    const byChannel = new Map<string, { orders: number; gmv: number }>();
    for (const o of data || []) { if (['cancelled', 'canceled'].includes(String(o.status))) continue; const k = o.sales_channel || 'website'; const a = byChannel.get(k) || { orders: 0, gmv: 0 }; a.orders++; a.gmv += Number(o.total || 0); byChannel.set(k, a); }
    return [...byChannel.entries()].map(([name, a]) => ({ name: cap(name), orders: a.orders, gmv: money(a.gmv), aov: a.orders ? money(a.gmv / a.orders) : '—' }));
  },
  'report-exec-gmv': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('order_date, total, amount_refunded, status').eq('tenant_id', DEFAULT_TENANT_ID).limit(2000);
    const byMonth = new Map<string, { orders: number; gmv: number; refunds: number }>();
    for (const o of data || []) { if (['cancelled', 'canceled'].includes(String(o.status))) continue; const k = String(o.order_date || '').slice(0, 7); if (!k) continue; const a = byMonth.get(k) || { orders: 0, gmv: 0, refunds: 0 }; a.orders++; a.gmv += Number(o.total || 0); a.refunds += Number(o.amount_refunded || 0); byMonth.set(k, a); }
    return [...byMonth.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([name, a]) => ({ name, orders: a.orders, gmv: money(a.gmv), refunds: money(a.refunds), net: money(a.gmv - a.refunds) }));
  },
  'report-ops-vitals': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('status, total').eq('tenant_id', DEFAULT_TENANT_ID).limit(2000);
    const byStatus = new Map<string, { orders: number; gmv: number }>();
    for (const o of data || []) { const k = cap(String(o.status || '').replace(/_/g, ' ')); const a = byStatus.get(k) || { orders: 0, gmv: 0 }; a.orders++; a.gmv += Number(o.total || 0); byStatus.set(k, a); }
    return [...byStatus.entries()].map(([name, a]) => ({ name, orders: a.orders, gmv: money(a.gmv) }));
  },


  // ── Reports hub misc + Settings config screens + channels ──
  contracts: async () => {
    const { data } = await supabaseAdmin().from('acct_revenue_contracts').select('id, contract_number, status, total_transaction_price, currency, start_date, end_date').eq('tenant_id', DEFAULT_TENANT_ID).order('contract_date', { ascending: false }).limit(200);
    return (data || []).map(c => ({ id: c.id, name: c.contract_number || '—', status: cap(String(c.status || '').replace(/_/g, ' ')), value: money(Number(c.total_transaction_price || 0)), term: `${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}` }));
  },
  terms: async () => {
    const { data } = await supabaseAdmin().from('cms_pages').select('id, title, slug, status, policy_effective_date').eq('tenant_id', DEFAULT_TENANT_ID).eq('page_type', 'policy').order('title').limit(200);
    return (data || []).map(pg => ({ id: pg.id, name: pg.title || '—', slug: pg.slug || '—', status: cap(String(pg.status || '')), effective: pg.policy_effective_date ? fmtDate(pg.policy_effective_date) : '—' }));
  },
  'pricing-tiers': async () => {
    const { data } = await supabaseAdmin().from('commerce_price_lists').select('id, code, name, currency, list_type, active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(pl => ({ id: pl.id, name: pl.name || '—', code: pl.code || '—', currency: pl.currency || '—', type: cap(String(pl.list_type || '').replace(/_/g, ' ')), status: pl.active ? 'Active' : 'Inactive' }));
  },
  'compliance-1099': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('acct_payroll_tax_forms').select('id, form_type, tax_year, vendor_id, status, box_values').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_year', { ascending: false }).limit(200);
    return (data || []).map(f => { const bv = (f.box_values || {}) as Record<string, unknown>; const amt = Number(bv.box_1 ?? bv.box_4 ?? 0); return { id: f.id, name: `${f.form_type || '1099'} · ${f.tax_year || ''}`, vendor: (f.vendor_id && names.get(f.vendor_id)) || '—', amount: amt ? money(amt) : '—', status: cap(String(f.status || '')) }; });
  },
  'compliance-audit': async () => {
    const { data } = await supabaseAdmin().from('platform_audit_events').select('occurred_at, action, object_table').eq('tenant_id', DEFAULT_TENANT_ID).order('occurred_at', { ascending: false }).limit(200);
    return (data || []).map(e => ({ name: `${cap(String(e.action || '').toLowerCase())} — ${String(e.object_table || '').replace(/^(acct_|crm_|erp_|platform_|commerce_|support_|social_|cms_|ad_)/, '').replace(/_/g, ' ')}`, when: fmtDate(e.occurred_at), table: e.object_table || '—' }));
  },
  'compliance-certifications': async () => [],
  'onboarding-requests': async () => {
    const { data } = await supabaseAdmin().from('sellers').select('id, display_name, legal_name, email, seller_type, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(v => ({ id: v.id, name: v.display_name || v.legal_name || '—', email: v.email || '—', type: cap(String(v.seller_type || '').replace(/_/g, ' ')), status: cap(String(v.status || '').replace(/_/g, ' ')), requested: fmtDate(v.created_at) }));
  },
  'onboarding-approvals': async () => {
    const { data } = await supabaseAdmin().from('sellers').select('id, display_name, legal_name, email, status, approved_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(v => ({ id: v.id, name: v.display_name || v.legal_name || '—', email: v.email || '—', status: cap(String(v.status || '').replace(/_/g, ' ')), approved: v.approved_at ? fmtDate(v.approved_at) : '—' }));
  },
  'onboarding-vendor-portal': async () => {
    const { data } = await supabaseAdmin().from('suppliers').select('name, slug, kind, ordering_status').order('name').limit(200);
    return (data || []).map(v => ({ name: v.name || '—', slug: v.slug || '—', kind: cap(String(v.kind || '').replace(/_/g, ' ')), status: cap(String(v.ordering_status || '').replace(/_/g, ' ')) }));
  },
  'feed-printful': async () => feedRows('printful'),
  'feed-printify': async () => feedRows('printify'),
  'feed-gelato': async () => feedRows('gelato'),
  'feed-stripe': async () => {
    const names = await partyNames();
    const { data } = await supabaseAdmin().from('seller_settlements').select('seller_id, gross_cents, net_cents, state, executed_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(st => ({ name: (st.seller_id && names.get(st.seller_id)) || 'Settlement', period: st.executed_at ? fmtDate(st.executed_at) : fmtDate(st.created_at), gross: money(Number(st.gross_cents || 0) / 100), net: money(Number(st.net_cents || 0) / 100), status: cap(String(st.state || '').replace(/_/g, ' ')) }));
  },
  'feed-receipts': async () => {
    const { data } = await supabaseAdmin().from('acct_document_inbox').select('doc_kind, source, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(d => ({ name: cap(String(d.doc_kind || '').replace(/_/g, ' ')), source: cap(String(d.source || '')), status: cap(String(d.status || '').replace(/_/g, ' ')), received: fmtDate(d.created_at) }));
  },
  'suppliers-overview': async () => {
    const { data } = await supabaseAdmin().from('suppliers').select('name, slug, kind, catalog_source, ordering_status').order('name').limit(200);
    return (data || []).map(v => ({ name: v.name || '—', kind: cap(String(v.kind || '').replace(/_/g, ' ')), catalog: v.catalog_source || '—', status: cap(String(v.ordering_status || '').replace(/_/g, ' ')) }));
  },
  'reports-overview': async () => {
    const [{ data: pkgs }, { data: snaps }] = await Promise.all([
      supabaseAdmin().from('acct_report_packages').select('id, name, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
      supabaseAdmin().from('acct_report_snapshots').select('package_id').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const counts = new Map<string, number>();
    for (const sn of snaps || []) counts.set(sn.package_id, (counts.get(sn.package_id) || 0) + 1);
    return (pkgs || []).map(pk => ({ name: pk.name || '—', snapshots: counts.get(pk.id) || 0, created: fmtDate(pk.created_at) }));
  },
  'catalog-overview': async () => {
    const sb = supabaseAdmin();
    const [products, published, categories, canonicals, bundles] = await Promise.all([
      sb.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'published'),
      sb.from('categories').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID),
      sb.from('canonical_products').select('id', { count: 'exact', head: true }),
      sb.from('catalog_bundles').select('id', { count: 'exact', head: true }),
    ]);
    return [
      { name: 'Products', count: products.count ?? 0, detail: `${published.count ?? 0} published` },
      { name: 'Categories', count: categories.count ?? 0, detail: 'Taxonomy tree' },
      { name: 'Canonical blanks', count: canonicals.count ?? 0, detail: 'Design Studio catalog' },
      { name: 'Bundles', count: bundles.count ?? 0, detail: 'Bundle offers' },
    ];
  },
  'set-sla-policies': async () => {
    const { data } = await supabaseAdmin().from('support_sla_policies').select('id, name, first_response_minutes, resolution_minutes, is_default, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(p => ({ id: p.id, name: p.name || '—', firstResponse: p.first_response_minutes != null ? `${p.first_response_minutes} min` : '—', resolution: p.resolution_minutes != null ? `${p.resolution_minutes} min` : '—', status: p.is_active ? (p.is_default ? 'Default' : 'Active') : 'Inactive' }));
  },
  'set-bank-rules': async () => {
    const { data } = await supabaseAdmin().from('acct_bank_rules').select('name, applies_to, txn_type, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(r => ({ name: r.name || '—', applies: cap(String(r.applies_to || '').replace(/_/g, ' ')), type: cap(String(r.txn_type || '').replace(/_/g, ' ')), status: r.is_active ? 'Active' : 'Paused' }));
  },
  'set-coa': async () => {
    const { data } = await supabaseAdmin().from('acct_chart_of_accounts').select('code, name, account_type, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('code').limit(300);
    return (data || []).map(a => ({ name: a.name || '—', code: a.code || '—', type: cap(String(a.account_type || '').replace(/_/g, ' ')), status: a.is_active ? 'Active' : 'Inactive' }));
  },
  'set-business-tax': async () => {
    const { data } = await supabaseAdmin().from('acct_tax_jurisdictions').select('name, code, country_code, state_code, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(j => ({ name: j.name || '—', code: j.code || '—', region: [j.state_code, j.country_code].filter(Boolean).join(', ') || '—', status: j.is_active ? 'Active' : 'Inactive' }));
  },
  'set-help-center': async () => kbRows(),
  'set-kb-config': async () => kbRows(),
  'set-automation-rules': async () => {
    const { data } = await supabaseAdmin().from('crm_automation_workflows').select('id, name, workflow_type, status').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(w => ({ id: w.id, name: w.name || '—', type: cap(String(w.workflow_type || '').replace(/_/g, ' ')), status: cap(String(w.status || '').replace(/_/g, ' ')) }));
  },
  'set-segments-lists': async () => {
    const { data } = await supabaseAdmin().from('crm_segments').select('id, name, description, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(sg => ({ id: sg.id, name: sg.name || '—', detail: sg.description || '—', status: sg.is_active === false ? 'Inactive' : 'Active' }));
  },
  'set-social-channels': async () => {
    const { data } = await supabaseAdmin().from('social_accounts').select('network, handle, status').eq('tenant_id', DEFAULT_TENANT_ID).order('network').limit(200);
    return (data || []).map(a => ({ name: cap(String(a.network || '')), handle: a.handle || '—', status: cap(String(a.status || '')) }));
  },
  'set-integrations': async () => {
    const { data } = await supabaseAdmin().from('suppliers').select('name, kind, catalog_source, ordering_status').order('name').limit(200);
    return (data || []).map(v => ({ name: v.name || '—', kind: cap(String(v.kind || '').replace(/_/g, ' ')), source: v.catalog_source || '—', status: cap(String(v.ordering_status || '').replace(/_/g, ' ')) }));
  },
  'set-integration-feeds': async () => {
    const sb = supabaseAdmin();
    const { data: sups } = await sb.from('suppliers').select('id, name').order('name');
    const rows: Record<string, string | number>[] = [];
    for (const sup of sups || []) {
      const { count } = await sb.from('supplier_catalog_products').select('id', { count: 'exact', head: true }).eq('supplier_id', sup.id);
      rows.push({ name: sup.name || '—', products: count ?? 0, status: 'Connected' });
    }
    return rows;
  },
  'set-vendors-suppliers': async () => {
    const { data } = await supabaseAdmin().from('acct_vendors').select('legal_name, display_name, email, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('legal_name').limit(200);
    return (data || []).map(v => ({ name: v.display_name || v.legal_name || '—', email: v.email || '—', status: v.is_active ? 'Active' : 'Inactive' }));
  },
  'set-supplier-portal': async () => {
    const { data } = await supabaseAdmin().from('suppliers').select('name, slug, ordering_status').order('name').limit(200);
    return (data || []).map(v => ({ name: v.name || '—', slug: v.slug || '—', status: cap(String(v.ordering_status || '').replace(/_/g, ' ')) }));
  },
  'set-inventory-warehouses': async () => {
    const { data } = await supabaseAdmin().from('erp_warehouses').select('code, name, warehouse_type, city, state, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(w => ({ name: w.name || '—', code: w.code || '—', type: cap(String(w.warehouse_type || '').replace(/_/g, ' ')), location: [w.city, w.state].filter(Boolean).join(', ') || '—', status: w.is_active ? 'Active' : 'Inactive' }));
  },
  'set-financial': async () => {
    const { data } = await supabaseAdmin().from('acct_entities').select('legal_name, display_name, functional_currency, fiscal_year_start_month, is_active').eq('tenant_id', DEFAULT_TENANT_ID).limit(50);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return (data || []).map(e => ({ name: e.display_name || e.legal_name || '—', currency: e.functional_currency || '—', fiscal: e.fiscal_year_start_month ? months[e.fiscal_year_start_month - 1] : '—', status: e.is_active === false ? 'Inactive' : 'Active' }));
  },
  'set-lead-capture': async () => {
    const { data } = await supabaseAdmin().from('platform_webforms').select('id, name, slug, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(f => ({ id: f.id, name: f.name || '—', slug: f.slug || '—', status: f.is_active ? 'Active' : 'Inactive' }));
  },
  'set-newsletter-email': async () => {
    const { data } = await supabaseAdmin().from('crm_campaigns').select('id, name, campaign_type, status').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(c => ({ id: c.id, name: c.name || '—', type: cap(String(c.campaign_type || '').replace(/_/g, ' ')), status: cap(String(c.status || '')) }));
  },
  'set-pricing-discounts': async () => {
    const { data } = await supabaseAdmin().from('commerce_promotions').select('code, name, promotion_type, value, active').eq('tenant_id', DEFAULT_TENANT_ID).order('code').limit(200);
    return (data || []).map(pr => ({ name: pr.code || '—', title: pr.name || '—', type: cap(String(pr.promotion_type || '').replace(/_/g, ' ')), value: pr.value ?? '—', status: pr.active ? 'Active' : 'Inactive' }));
  },
  'set-products-bundles': async () => {
    const { data } = await supabaseAdmin().from('catalog_bundles').select('id, name, slug, status, price').order('name').limit(200);
    return (data || []).map(b => ({ id: b.id, name: b.name || '—', slug: b.slug || '—', price: b.price != null ? money(Number(b.price)) : '—', status: cap(String(b.status || '').replace(/_/g, ' ')) }));
  },
  'set-publishing-queue': async () => {
    const { data } = await supabaseAdmin().from('social_posts').select('id, title, caption, status, scheduled_at').eq('tenant_id', DEFAULT_TENANT_ID).in('status', ['draft', 'scheduled', 'publishing']).order('scheduled_at').limit(200);
    return (data || []).map(po => ({ id: po.id, name: po.title || (po.caption ? String(po.caption).slice(0, 60) : '—'), status: cap(String(po.status || '')), scheduled: po.scheduled_at ? fmtDate(po.scheduled_at) : '—' }));
  },
  'set-ad-center': async () => {
    const { data } = await supabaseAdmin().from('ad_campaigns').select('id, name, delivery_type, status').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(c => ({ id: c.id, name: c.name || '—', network: cap(String(c.delivery_type || '').replace(/_/g, ' ')) || '—', status: cap(String(c.status || '').replace(/_/g, ' ')) }));
  },
  'set-audit': async () => {
    const { data } = await supabaseAdmin().from('platform_audit_events').select('occurred_at, action, object_table').eq('tenant_id', DEFAULT_TENANT_ID).order('occurred_at', { ascending: false }).limit(200);
    return (data || []).map(e => ({ name: `${cap(String(e.action || '').toLowerCase())} — ${String(e.object_table || '').replace(/_/g, ' ')}`, when: fmtDate(e.occurred_at) }));
  },
  'set-api-tokens': async () => {
    const { data } = await supabaseAdmin().from('api_keys').select('label, key_prefix, tier, status, last_used_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(k => ({ name: k.label || '—', prefix: k.key_prefix || '—', tier: cap(String(k.tier || '')), status: cap(String(k.status || '')), used: k.last_used_at ? fmtDate(k.last_used_at) : 'Never' }));
  },
  'set-categories-tags': async () => {
    const { data } = await supabaseAdmin().from('categories').select('id, name, level, slug, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('level').order('sort_order').limit(300);
    return (data || []).map(c => ({ id: c.id, name: c.name || '—', level: `L${c.level ?? '—'}`, slug: c.slug || '—', status: c.is_active ? 'Active' : 'Inactive' }));
  },
  'set-design-studio': async () => {
    const { data } = await supabaseAdmin().from('tenant_settings').select('data').eq('tenant_id', DEFAULT_TENANT_ID).eq('section', 'design_studio').maybeSingle();
    const d = (data?.data || {}) as Record<string, unknown>;
    return Object.entries(d).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: String(v) }));
  },
  'set-report-dashboards': async () => {
    const { data } = await supabaseAdmin().from('platform_dashboards').select('id, name, module, is_default, is_shared').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(d => ({ id: d.id, name: d.name || '—', module: d.module || '—', sharing: d.is_shared ? 'Shared' : 'Private', status: d.is_default ? 'Default' : 'Active' }));
  },
  'set-fulfillment-shipping': async () => {
    const { data } = await supabaseAdmin().from('erp_carriers').select('name, code, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(200);
    return (data || []).map(c => ({ name: c.name || '—', code: c.code || '—', status: c.is_active ? 'Active' : 'Inactive' }));
  },

  // ── KPI targets: platform_kpi_targets (Settings → KPI targets). ──
  'set-kpi-targets': async () => {
    const { data } = await supabaseAdmin().from('platform_kpi_targets').select('id, metric_code, period_type, period_start, target_value, notes').eq('tenant_id', DEFAULT_TENANT_ID).order('period_start', { ascending: false }).limit(200);
    return (data || []).map(t => ({
      id: t.id, metric: t.metric_code || '—',
      period: `${cap(String(t.period_type || ''))} · ${fmtDate(t.period_start)}`,
      target: money(Number(t.target_value || 0)),
      notes: t.notes || '—',
    }));
  },

  // ── Dashboards & widgets: platform_dashboards + widget counts. ──
  'set-dashboards': async () => {
    const [{ data: dashboards }, { data: widgets }] = await Promise.all([
      supabaseAdmin().from('platform_dashboards').select('id, name, module, is_default, is_shared, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
      supabaseAdmin().from('platform_dashboard_widgets').select('dashboard_id').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const counts = new Map<string, number>();
    for (const w of widgets || []) counts.set(w.dashboard_id, (counts.get(w.dashboard_id) || 0) + 1);
    return (dashboards || []).map(d => ({
      id: d.id, name: d.name || '—',
      module: d.module || '—',
      widgets: counts.get(d.id) || 0,
      sharing: d.is_shared ? 'Shared' : 'Private',
      status: d.is_default ? 'Default' : 'Active',
      updated: fmtDate(d.updated_at),
    }));
  },

  // ── Download tax summary: the sales-tax filings on file are the
  // downloadable tax documents; the Tax Summary screen exports the
  // summary itself as CSV. ──
  'download-tax-summary': async () => {
    const [{ data: filings }, { data: jurisdictions }] = await Promise.all([
      supabaseAdmin().from('acct_tax_filings').select('jurisdiction_id, period_label, period_start, period_end, tax_collected, tax_remitted, status').eq('tenant_id', DEFAULT_TENANT_ID).order('period_start', { ascending: false }),
      supabaseAdmin().from('acct_tax_jurisdictions').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const jName = new Map((jurisdictions || []).map(j => [j.id, j.name]));
    return (filings || []).map(f => ({
      period: f.period_label || `${fmtDate(f.period_start)} – ${fmtDate(f.period_end)}`,
      jurisdiction: jName.get(f.jurisdiction_id) || '—',
      collected: money(Number(f.tax_collected || 0)),
      paid: money(Number(f.tax_remitted || 0)),
      status: cap(String(f.status || '').replace(/_/g, ' ')),
    }));
  },

  // ── Sales Tax (spec-5): the 9 sales-tax sub-pages. Rates reads the
  // canonical acct_tax_codes — the engine never reads acct_tax_rates
  // (see /api/tax/rates). ──
  'sales_tax-exemptions': async () => {
    const [names, jurs] = await Promise.all([partyNames(), jurisdictionNames()]);
    const { data } = await supabaseAdmin().from('acct_tax_exemptions').select('customer_id, jurisdiction_id, reason, certificate_no, valid_from, valid_to, verified_at').eq('tenant_id', DEFAULT_TENANT_ID).order('valid_from', { ascending: false });
    return (data || []).map(e => ({
      customer: names.get(e.customer_id) || '—',
      jurisdiction: jurs.get(e.jurisdiction_id) || '—',
      reason: cap(String(e.reason || '').replace(/_/g, ' ')),
      certificate: e.certificate_no || '—',
      validFrom: fmtDate(e.valid_from),
      validTo: fmtDate(e.valid_to),
      status: e.verified_at ? 'Verified' : 'Unverified',
    }));
  },

  'sales_tax-filings': async () => {
    const jurs = await jurisdictionNames();
    const { data } = await supabaseAdmin().from('acct_tax_filings').select('period_label, period_start, period_end, jurisdiction_id, taxable_sales, tax_collected, tax_remitted, amount_due, status, due_date, confirmation_ref').eq('tenant_id', DEFAULT_TENANT_ID).order('period_start', { ascending: false });
    return (data || []).map(f => ({
      period: f.period_label || `${fmtDate(f.period_start)} – ${fmtDate(f.period_end)}`,
      jurisdiction: jurs.get(f.jurisdiction_id) || '—',
      taxable: money(Number(f.taxable_sales || 0)),
      collected: money(Number(f.tax_collected || 0)),
      remitted: money(Number(f.tax_remitted || 0)),
      due: money(Number(f.amount_due || 0)),
      status: cap(String(f.status || '').replace(/_/g, ' ')),
      dueDate: fmtDate(f.due_date),
      confirmation: f.confirmation_ref || '—',
    }));
  },

  'sales_tax-jurisdictions': async () => {
    const { data } = await supabaseAdmin().from('acct_tax_jurisdictions').select('code, name, level, state_code, locality, registration_number, filing_frequency, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
    return (data || []).map(j => ({
      code: j.code || '—',
      name: j.name || '—',
      level: cap(String(j.level || '').replace(/_/g, ' ')),
      state: [j.state_code, j.locality].filter(Boolean).join(' · ') || '—',
      registration: j.registration_number || '—',
      frequency: cap(String(j.filing_frequency || '').replace(/_/g, ' ')),
      status: j.is_active ? 'Active' : 'Inactive',
    }));
  },

  'sales_tax-marketplace-remittance': async () => {
    const { data } = await supabaseAdmin().from('seller_tax_remittance_filings').select('jurisdiction, period_start, period_end, tax_collected, amount_remitted, filed_at, confirmation_number, status').eq('tenant_id', DEFAULT_TENANT_ID).order('period_start', { ascending: false });
    return (data || []).map(f => ({
      jurisdiction: f.jurisdiction || '—',
      period: `${fmtDate(f.period_start)} – ${fmtDate(f.period_end)}`,
      collected: money(Number(f.tax_collected || 0)),
      remitted: money(Number(f.amount_remitted || 0)),
      filed: fmtDate(f.filed_at),
      confirmation: f.confirmation_number || '—',
      status: cap(String(f.status || '').replace(/_/g, ' ')),
    }));
  },

  'sales_tax-nexus': async () => {
    const jurs = await jurisdictionNames();
    const { data } = await supabaseAdmin().from('acct_tax_nexus').select('jurisdiction_id, nexus_type, collect_tax, registration_number, registered_on, filing_frequency, economic_sales_threshold').eq('tenant_id', DEFAULT_TENANT_ID).order('registered_on', { ascending: false });
    return (data || []).map(n => ({
      jurisdiction: jurs.get(n.jurisdiction_id) || '—',
      type: cap(String(n.nexus_type || '').replace(/_/g, ' ')),
      collect: n.collect_tax ? 'Yes' : 'No',
      registration: n.registration_number || '—',
      registered: fmtDate(n.registered_on),
      frequency: cap(String(n.filing_frequency || '').replace(/_/g, ' ')),
      threshold: n.economic_sales_threshold != null ? money(Number(n.economic_sales_threshold)) : '—',
    }));
  },

  'sales_tax-nexus-alerts': async () => {
    const { data } = await supabaseAdmin().from('tax_nexus_alerts').select('state_code, status, window_label, counted_sales, counted_txns, pct_of_threshold, first_detected_at, resolution').eq('tenant_id', DEFAULT_TENANT_ID).order('first_detected_at', { ascending: false });
    return (data || []).map(a => ({
      state: a.state_code || '—',
      status: cap(String(a.status || '').replace(/_/g, ' ')),
      window: a.window_label || '—',
      sales: money(Number(a.counted_sales || 0)),
      txns: a.counted_txns ?? '—',
      // pct_of_threshold is stored as a percent (0–100, 1dp) by
      // tax_nexus_exposure — round(pct * 100, 1).
      pct: a.pct_of_threshold != null ? `${Number(Number(a.pct_of_threshold).toFixed(1))}%` : '—',
      detected: fmtDate(a.first_detected_at),
      resolution: a.resolution || '—',
    }));
  },

  'sales_tax-rates': async () => {
    const [jurs, accounts] = await Promise.all([jurisdictionNames(), accountNames()]);
    const { data } = await supabaseAdmin().from('acct_tax_codes').select('name, code, jurisdiction_id, rate, payable_account_id, effective_from, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
    return (data || []).map(c => ({
      name: c.name || '—',
      code: c.code || '—',
      jurisdiction: jurs.get(c.jurisdiction_id) || '—',
      rate: pct(Number(c.rate) || 0),
      payable: c.payable_account_id ? (accounts.get(c.payable_account_id) || '—') : '—',
      effective: fmtDate(c.effective_from),
      status: c.is_active ? 'Active' : 'Inactive',
    }));
  },

  'sales_tax-tax-transactions': async () => {
    const jurs = await jurisdictionNames();
    const { data } = await supabaseAdmin().from('acct_tax_transactions').select('tax_date, source_doc_type, jurisdiction_id, tax_category, gross_amount, taxable_amount, tax_amount, rate, reason, filing_id').eq('tenant_id', DEFAULT_TENANT_ID).order('tax_date', { ascending: false }).limit(200);
    return (data || []).map(t => ({
      date: fmtDate(t.tax_date),
      source: cap(String(t.source_doc_type || '').replace(/_/g, ' ')),
      jurisdiction: jurs.get(t.jurisdiction_id) || '—',
      category: t.tax_category || '—',
      gross: money(Number(t.gross_amount || 0)),
      taxable: money(Number(t.taxable_amount || 0)),
      tax: money(Number(t.tax_amount || 0)),
      rate: pct(Number(t.rate) || 0),
      reason: t.reason || '—',
      filed: t.filing_id ? 'Filed' : 'Unfiled',
    }));
  },

  'sales_tax-taxability-rules': async () => {
    const jurs = await jurisdictionNames();
    const { data } = await supabaseAdmin().from('acct_tax_taxability_rules').select('name, jurisdiction_id, tax_category, treatment, rate_override, direction, effective_from, priority, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('priority', { ascending: false });
    return (data || []).map(r => ({
      name: r.name || '—',
      jurisdiction: jurs.get(r.jurisdiction_id) || '—',
      category: r.tax_category || '—',
      treatment: cap(String(r.treatment || '').replace(/_/g, ' ')),
      override: r.rate_override != null ? pct(Number(r.rate_override)) : '—',
      direction: cap(String(r.direction || '').replace(/_/g, ' ')),
      effective: fmtDate(r.effective_from),
      priority: r.priority ?? '—',
      status: r.is_active ? 'Active' : 'Inactive',
    }));
  },

  // ── Community, Reviews & UGC (spec-7): the 5 nav pages plus
  // Reviews. Counters come from the engine (ugc_product_counters),
  // these lists show the underlying rows. ──
  'community-reviews': async () => {
    const { data } = await supabaseAdmin().from('reviews').select('id,product_id,customer_id,author_name,title,rating,status,is_verified_purchase,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const products = await productNames((data || []).map(r => r.product_id));
    const parties = await partyNames();
    return (data || []).map(r => ({
      id: r.id,
      product: products.get(r.product_id) || String(r.product_id).slice(0, 8),
      author: r.author_name || (r.customer_id ? parties.get(r.customer_id) || '—' : 'Guest'),
      rating: r.rating,
      title: r.title || '—',
      verified: r.is_verified_purchase ? 'Yes' : 'No',
      status: cap(String(r.status || '').replace(/_/g, ' ')),
      date: fmtDate(r.created_at),
    }));
  },

  'community-posts': async () => {
    const { data } = await supabaseAdmin().from('ugc_posts').select('id,product_id,author_display_name,title,rating,status,published_at,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const products = await productNames((data || []).map(p => p.product_id));
    return (data || []).map(p => ({
      id: p.id,
      author: p.author_display_name || '—',
      title: p.title || '—',
      product: products.get(p.product_id) || String(p.product_id).slice(0, 8),
      rating: p.rating ?? '—',
      status: cap(String(p.status || '').replace(/_/g, ' ')),
      published: fmtDate(p.published_at),
      date: fmtDate(p.created_at),
    }));
  },

  'community-comments': async () => {
    const { data } = await supabaseAdmin().from('ugc_comments').select('id,post_id,product_id,review_id,author_display_name,kind,body,status,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const products = await productNames((data || []).map(c => c.product_id).filter(Boolean));
    return (data || []).map(c => ({
      id: c.id,
      author: c.author_display_name || '—',
      on: c.product_id ? (products.get(c.product_id) || 'Product') : c.post_id ? `Post ${String(c.post_id).slice(0, 8)}` : c.review_id ? `Review ${String(c.review_id).slice(0, 8)}` : '—',
      kind: cap(String(c.kind || '').replace(/_/g, ' ')),
      body: c.body || '—',
      status: cap(String(c.status || '').replace(/_/g, ' ')),
      date: fmtDate(c.created_at),
    }));
  },

  'community-media': async () => {
    const { data } = await supabaseAdmin().from('ugc_media').select('id,post_id,review_id,kind,storage_path,status,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(m => ({
      id: m.id,
      kind: cap(String(m.kind || '').replace(/_/g, ' ')),
      on: m.post_id ? `Post ${String(m.post_id).slice(0, 8)}` : m.review_id ? `Review ${String(m.review_id).slice(0, 8)}` : '—',
      storage: m.storage_path ? String(m.storage_path).split('/').pop() || m.storage_path : '—',
      status: cap(String(m.status || '').replace(/_/g, ' ')),
      date: fmtDate(m.created_at),
    }));
  },

  'community-trust-&-safety--policies': async () => {
    const { data } = await supabaseAdmin().from('trust_policies').select('id,code,title,version,status,updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('code');
    return (data || []).map(p => ({
      id: p.id,
      code: p.code || '—',
      title: p.title || '—',
      version: p.version ?? '—',
      status: cap(String(p.status || '').replace(/_/g, ' ')),
      updated: fmtDate(p.updated_at),
    }));
  },

  'community-trust-&-safety--reports': async () => {
    const { data } = await supabaseAdmin().from('ugc_reports').select('id,reporter_customer_id,target_type,target_id,reason,status,reviewed_at,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const parties = await partyNames();
    return (data || []).map(r => ({
      id: r.id,
      target: `${cap(String(r.target_type || ''))} ${String(r.target_id).slice(0, 8)}`,
      reason: r.reason || '—',
      status: cap(String(r.status || '').replace(/_/g, ' ')),
      reporter: r.reporter_customer_id ? (parties.get(r.reporter_customer_id) || '—') : 'Anonymous',
      reviewed: fmtDate(r.reviewed_at),
      date: fmtDate(r.created_at),
    }));
  },

  // ── Catalog: channel listings. commerce_channel_products is keyed by
  // commerce_catalog_items (NOT products) — the item's name/sku is the
  // listing's product. Channel screens filter by channel slug
  // (code or slugified name); the tenant has no channels yet, so every
  // channel list is honestly empty until one is connected. ──
  listings: async () => loadChannelListings(),
  amazon: async () => loadChannelListings('amazon'),
  tiktok: async () => loadChannelListings('tiktok'),
  'facebook-marketplace': async () => loadChannelListings('facebook-marketplace'),
  whatnot: async () => loadChannelListings('whatnot'),
  etsy: async () => loadChannelListings('etsy'),
  ebay: async () => loadChannelListings('ebay'),

  // ── Catalog: bundles (catalog_bundles + component counts). ──
  bundles: async () => {
    const [{ data: bundles }, { data: components }] = await Promise.all([
      supabaseAdmin().from('catalog_bundles').select('id, name, slug, status, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
      supabaseAdmin().from('catalog_bundle_components').select('bundle_id').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const counts = new Map<string, number>();
    for (const c of components || []) counts.set(c.bundle_id, (counts.get(c.bundle_id) || 0) + 1);
    return (bundles || []).map(b => ({
      id: b.id,
      name: b.name || '—',
      slug: b.slug || '—',
      items: counts.get(b.id) || 0,
      status: cap(String(b.status || '').replace(/_/g, ' ')),
      updated: fmtDate(b.updated_at),
    }));
  },

  // ── Catalog: storefront categories with parent names + live product counts. ──
  categories: async () => {
    const [{ data: cats }, { data: products }] = await Promise.all([
      supabaseAdmin().from('categories').select('id, parent_id, name, slug, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
      supabaseAdmin().from('products').select('category_id').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const nameById = new Map((cats || []).map(c => [c.id, c.name]));
    const counts = new Map<string, number>();
    for (const p of products || []) if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
    return (cats || []).map(c => ({
      id: c.id,
      name: c.name || '—',
      slug: c.slug || '—',
      parent: (c.parent_id && nameById.get(c.parent_id)) || '—',
      products: counts.get(c.id) || 0,
      status: c.is_active ? 'Active' : 'Inactive',
    }));
  },

  // ── Catalog: variants across the whole catalog (newest 200 — the
  // table holds 160k+ rows, so this is a window, not the whole book). ──
  variants: async () => {
    const { data: variants } = await supabaseAdmin().from('product_variants').select('id, product_id, sku, size, color, price, standard_cost, stock_quantity, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const ids = [...new Set((variants || []).map(v => v.product_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabaseAdmin().from('products').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', ids.slice(i, i + 100));
      for (const p of data || []) names.set(p.id, p.name);
    }
    return (variants || []).map(v => ({
      id: v.id,
      sku: v.sku || '—',
      product: names.get(v.product_id) || '—',
      size: v.size || '—',
      color: v.color || '—',
      price: v.price != null ? money(Number(v.price)) : '—',
      // Variance cost column: standard_cost is the cost the margin is
      // measured against; margin is (price − cost) / price, "—" when no
      // cost is on file (cost 0) rather than a fabricated 100%.
      cost: Number(v.standard_cost || 0) > 0 ? money(Number(v.standard_cost)) : '—',
      margin: Number(v.price || 0) > 0 && Number(v.standard_cost || 0) > 0
        ? `${(((Number(v.price) - Number(v.standard_cost)) / Number(v.price)) * 100).toFixed(1)}%`
        : '—',
      stock: v.stock_quantity ?? '—',
      status: v.is_active ? 'Active' : 'Inactive',
    }));
  },

  // ── Catalog: listing availability (the listing_v_availability view —
  // what a listing can actually sell right now). ──
  availability: async () => {
    const { data: rows } = await supabaseAdmin().from('listing_v_availability').select('catalog_product_id, node_id, path, sku, availability_source, available_qty, can_sell').eq('tenant_id', DEFAULT_TENANT_ID).limit(200);
    const ids = [...new Set((rows || []).map(r => r.catalog_product_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabaseAdmin().from('supplier_catalog_products').select('id, name').in('id', ids.slice(i, i + 100));
      for (const p of data || []) names.set(p.id, p.name);
    }
    return (rows || []).map(r => ({
      product: names.get(r.catalog_product_id) || '—',
      sku: r.sku || '—',
      node: r.path || '—',
      source: String(r.availability_source || '').replace(/_/g, ' '),
      qty: r.available_qty ?? '—',
      status: r.can_sell ? 'Sellable' : 'Blocked',
    }));
  },

  // ── Catalog: listing categories (taxonomy_nodes). ──
  'catalog-listing--categories': async () => {
    const { data } = await supabaseAdmin().from('taxonomy_nodes').select('id, node_type, name, display_name, slug, path, depth, status, product_count').eq('tenant_id', DEFAULT_TENANT_ID).order('path', { ascending: true });
    return (data || []).map(n => ({
      id: n.id,
      name: n.display_name || n.name || '—',
      type: n.node_type || '—',
      path: n.path || n.slug || '—',
      products: n.product_count ?? 0,
      status: cap(String(n.status || 'active').replace(/_/g, ' ')),
    }));
  },

  // ── Catalog: category map (listing_category_map + node / source names). ──
  'category-map': async () => {
    const [{ data: maps }, { data: nodes }, { data: sources }] = await Promise.all([
      supabaseAdmin().from('listing_category_map').select('id, node_id, source_category_id, match_kind, effect, priority, status').eq('tenant_id', DEFAULT_TENANT_ID).order('priority', { ascending: true }),
      supabaseAdmin().from('taxonomy_nodes').select('id, display_name, name').eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin().from('catalog_source_categories').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const nodeName = new Map((nodes || []).map(n => [n.id, n.display_name || n.name]));
    const srcName = new Map((sources || []).map(s => [s.id, s.name]));
    return (maps || []).map(m => ({
      id: m.id,
      node: nodeName.get(m.node_id) || '—',
      source: srcName.get(m.source_category_id) || '—',
      match: String(m.match_kind || '').replace(/_/g, ' '),
      effect: m.effect || '—',
      priority: m.priority ?? '—',
      status: cap(String(m.status || '').replace(/_/g, ' ')),
    }));
  },

  // ── Catalog: published products (product_taxonomy_links + blank names). ──
  'published-products': async () => {
    const { data: links } = await supabaseAdmin().from('product_taxonomy_links').select('id, product_id, path, is_primary, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const ids = [...new Set((links || []).map(l => l.product_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabaseAdmin().from('supplier_catalog_products').select('id, name').in('id', ids.slice(i, i + 100));
      for (const p of data || []) names.set(p.id, p.name);
    }
    return (links || []).map(l => ({
      id: l.id,
      product: names.get(l.product_id) || '—',
      path: l.path || '—',
      primary: l.is_primary ? 'Yes' : 'No',
      created: fmtDate(l.created_at),
    }));
  },

  // ── Website / CMS: pages, banners, popups, blocks, navigation, media.
  //    Status tabs filter on the row's status column, so statuses are
  //    normalized to the defs' tab labels. Banner/popup "Active" means
  //    is_active AND inside the scheduling window — the window, not the
  //    flag alone, decides what the storefront shows. ──
  'cms-pages': async () => {
    const { data } = await supabaseAdmin().from('cms_pages').select('id, title, slug, page_type, status, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false }).limit(200);
    return (data || []).map(p => ({
      id: p.id,
      title: p.title || '—',
      slug: p.slug || '—',
      type: p.page_type || 'page',
      status: p.status === 'published' ? 'Published' : p.status === 'archived' ? 'Archived' : 'Draft',
      updated: fmtDate(p.updated_at),
    }));
  },

  'website-cms': async () => {
    const { data } = await supabaseAdmin().from('cms_pages').select('id, title, slug, page_type, status, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false }).limit(200);
    return (data || []).map(p => ({
      id: p.id,
      title: p.title || '—',
      slug: p.slug || '—',
      type: p.page_type || 'page',
      status: p.status === 'published' ? 'Published' : p.status === 'archived' ? 'Archived' : 'Draft',
      updated: fmtDate(p.updated_at),
    }));
  },

  banners: async () => {
    const now = Date.now();
    const { data } = await supabaseAdmin().from('cms_banners').select('id, name, placement, headline, is_active, starts_at, ends_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(b => {
      const live = !!b.is_active
        && (!b.starts_at || new Date(b.starts_at).getTime() <= now)
        && (!b.ends_at || new Date(b.ends_at).getTime() >= now);
      return {
        id: b.id,
        name: b.name || '—',
        placement: b.placement || '—',
        headline: b.headline || '—',
        status: live ? 'Active' : 'Off',
        window: b.starts_at || b.ends_at ? `${fmtDate(b.starts_at)} – ${fmtDate(b.ends_at)}` : 'Always',
      };
    });
  },

  popups: async () => {
    const now = Date.now();
    const { data } = await supabaseAdmin().from('cms_popups').select('id, name, trigger_type, is_active, starts_at, ends_at, impressions, conversions').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(p => {
      const live = !!p.is_active
        && (!p.starts_at || new Date(p.starts_at).getTime() <= now)
        && (!p.ends_at || new Date(p.ends_at).getTime() >= now);
      return {
        id: p.id,
        name: p.name || '—',
        trigger: p.trigger_type || '—',
        status: live ? 'Active' : 'Off',
        impressions: p.impressions ?? 0,
        conversions: p.conversions ?? 0,
      };
    });
  },

  'content-blocks': async () => {
    const { data } = await supabaseAdmin().from('cms_content_blocks').select('id, block_id, component_type, slot_id, status').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(b => ({
      id: b.id,
      block: b.block_id || '—',
      component: b.component_type || '—',
      slot: b.slot_id || '—',
      status: b.status === 'published' ? 'Published' : 'Draft',
    }));
  },

  navigation: async () => {
    const { data } = await supabaseAdmin().from('cms_navigation_menus').select('id, name, location, status').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(m => ({
      id: m.id,
      name: m.name || '—',
      location: m.location || '—',
      status: cap(String(m.status || 'draft')),
    }));
  },

  media: async () => {
    const { data } = await supabaseAdmin().from('cms_media_assets').select('id, title, url, mime_type, file_size, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(m => ({
      id: m.id,
      title: m.title || m.url || '—',
      type: m.mime_type || '—',
      size: m.file_size != null ? `${Math.round(Number(m.file_size) / 1024)} KB` : '—',
      status: cap(String(m.status || 'draft')),
      updated: fmtDate(m.created_at),
    }));
  },

  // ── Catalog: source products (supplier_catalog_products — the blanks
  // and source items inventory is built from). ──
  'catalog-sources--products': async () => {
    const [{ data: items }, { data: cats }] = await Promise.all([
      supabaseAdmin().from('supplier_catalog_products').select('id, name, brand_name, external_id, variant_count, category_id, is_hidden').order('name', { ascending: true }).limit(200),
      // supplier_catalog_products.category_id references the storefront
      // categories table, not catalog_source_categories.
      supabaseAdmin().from('categories').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    const catName = new Map((cats || []).map(c => [c.id, c.name]));
    return (items || []).map(p => ({
      id: p.id,
      name: p.name || '—',
      brand: p.brand_name || '—',
      external: p.external_id || '—',
      variants: p.variant_count ?? 0,
      category: catName.get(p.category_id) || '—',
      status: p.is_hidden ? 'Hidden' : 'Available',
    }));
  },

  // ── Catalog: source categories (catalog_source_categories). ──
  'source-categories': async () => {
    const { data } = await supabaseAdmin().from('catalog_source_categories').select('id, name, path, depth, product_count, status').order('path', { ascending: true });
    return (data || []).map(c => ({
      id: c.id,
      name: c.name || '—',
      path: c.path || '—',
      depth: c.depth ?? '—',
      products: c.product_count ?? 0,
      status: cap(String(c.status || '').replace(/_/g, ' ')),
    }));
  },

  // ── Orders & Fulfillment (spec-2): the nav screens that rendered the
  // generic empty list. Each loader reads its spec backing table. ──
  'holds-&-needs-attention': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number, customer_email, metadata, sales_channel, marketplace_name, order_date, total, status, on_hold, hold_reason, needs_attention, attention_reason').eq('tenant_id', DEFAULT_TENANT_ID).or('on_hold.eq.true,needs_attention.eq.true').order('order_date', { ascending: false }).limit(200);
    return (data || []).map(o => orderIssueRow(o));
  },
  'order-issues': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number, customer_email, metadata, sales_channel, marketplace_name, order_date, total, status, on_hold, hold_reason, needs_attention, attention_reason').eq('tenant_id', DEFAULT_TENANT_ID).eq('needs_attention', true).order('order_date', { ascending: false }).limit(200);
    return (data || []).map(o => orderIssueRow(o));
  },
  'order-issues-(needs-attention)': async () => {
    const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number, customer_email, metadata, sales_channel, marketplace_name, order_date, total, status, on_hold, hold_reason, needs_attention, attention_reason').eq('tenant_id', DEFAULT_TENANT_ID).eq('needs_attention', true).order('order_date', { ascending: false }).limit(200);
    return (data || []).map(o => orderIssueRow(o));
  },
  'packing-slip': async () => {
    const { data } = await supabaseAdmin().from('commerce_batch_slips').select('id, batch_number, warehouse_id, status, document_uri, created_at, printed_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(b => ({
      id: b.id,
      batch: b.batch_number || '—',
      warehouse: b.warehouse_id ? String(b.warehouse_id).slice(0, 8) : '—',
      status: cap(String(b.status || '').replace(/_/g, ' ')),
      document: b.document_uri || '—',
      created: fmtDate(b.created_at),
      printed: fmtDate(b.printed_at),
    }));
  },
  fulfillment: async () => {
    const { data: fuls } = await supabaseAdmin().from('erp_fulfillment_orders').select('id, fulfillment_number, order_id, method, status, priority, dispatched_at, completed_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const orderIds = [...new Set((fuls || []).map(f => f.order_id).filter(Boolean))] as string[];
    const orderNo = new Map<string, string>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number').in('id', orderIds.slice(i, i + 100));
      for (const o of data || []) orderNo.set(o.id, o.order_number);
    }
    return (fuls || []).map(f => {
      // Tabs are All / Open / Shipped / Cancelled: in-progress states
      // (released, packed, staged, dispatched, pending) read as Open.
      const raw = String(f.status || '').toLowerCase();
      const status = raw === 'cancelled' ? 'Cancelled' : ['shipped', 'delivered', 'completed', 'closed'].includes(raw) ? cap(raw.replace(/_/g, ' ')) : 'Open';
      return {
        id: f.id,
        fulfillment: f.fulfillment_number || '—',
        order: orderNo.get(f.order_id) || '—',
        method: f.method || '—',
        status,
        priority: f.priority ?? '—',
        dispatched: fmtDate(f.dispatched_at),
        completed: fmtDate(f.completed_at),
      };
    });
  },
  'batch-slips-&-labels': async () => {
    const { data } = await supabaseAdmin().from('commerce_shipping_labels').select('id, shipment_id, label_type, carrier, tracking_number, postage_amount, printed_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(l => ({
      id: l.id,
      label: l.label_type || '—',
      shipment: l.shipment_id ? String(l.shipment_id).slice(0, 8) : '—',
      carrier: l.carrier || '—',
      tracking: l.tracking_number || '—',
      postage: l.postage_amount != null ? money(Number(l.postage_amount)) : '—',
      printed: fmtDate(l.printed_at),
    }));
  },
  'customer-return-requests': async () => {
    const { data } = await supabaseAdmin().from('customer_return_requests').select('id, order_number, order_email, request_type, reason_code, item_name, status').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    return (data || []).map(r => ({
      id: r.id,
      request: String(r.id).slice(0, 8),
      order: r.order_number || '—',
      customer: r.order_email || '—',
      item: r.item_name || '—',
      type: String(r.request_type || '').replace(/_/g, ' '),
      reason: String(r.reason_code || '').replace(/_/g, ' '),
      status: cap(String(r.status || '').replace(/_/g, ' ')),
    }));
  },
  'returns-&-claims': async () => {
    const { data: rmas } = await supabaseAdmin().from('erp_return_authorizations').select('id, rma_number, order_id, crm_customer_id, status, reason_code, requested_at').eq('tenant_id', DEFAULT_TENANT_ID).order('requested_at', { ascending: false }).limit(200);
    const orderIds = [...new Set((rmas || []).map(r => r.order_id).filter(Boolean))] as string[];
    const orderNo = new Map<string, string>();
    const orderEmail = new Map<string, string>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number, customer_email').in('id', orderIds.slice(i, i + 100));
      for (const o of data || []) { orderNo.set(o.id, o.order_number); orderEmail.set(o.id, o.customer_email); }
    }
    return (rmas || []).map(r => ({
      id: r.id,
      rma: r.rma_number || '—',
      order: orderNo.get(r.order_id) || '—',
      customer: orderEmail.get(r.order_id) || '—',
      reason: String(r.reason_code || '').replace(/_/g, ' '),
      status: cap(String(r.status || '').replace(/_/g, ' ')),
      requested: fmtDate(r.requested_at),
    }));
  },
  'order-detail': async () => {
    const { data: lines } = await supabaseAdmin().from('erp_order_lines').select('id, order_id, description, sku_id, quantity, unit_price, line_total, quantity_shipped, status').order('created_at', { ascending: false }).limit(500);
    const orderIds = [...new Set((lines || []).map(l => l.order_id).filter(Boolean))] as string[];
    const orderNo = new Map<string, string>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const { data } = await supabaseAdmin().from('erp_orders').select('id, order_number').in('id', orderIds.slice(i, i + 100));
      for (const o of data || []) orderNo.set(o.id, o.order_number);
    }
    return (lines || []).map(l => ({
      id: l.id,
      order: orderNo.get(l.order_id) || '—',
      item: l.description || '—',
      sku: l.sku_id ? String(l.sku_id).slice(0, 8) : '—',
      qty: l.quantity ?? '—',
      price: l.unit_price != null ? money(Number(l.unit_price)) : '—',
      total: l.line_total != null ? money(Number(l.line_total)) : money((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)),
      shipped: l.quantity_shipped ?? 0,
      status: cap(String(l.status || '').replace(/_/g, ' ')),
    }));
  },

  // ── Purchasing & Inventory (spec-3): the 5 inventory sub-pages with no
  // component of their own. Each loader reads its spec backing table. ──
  'inventory-cost-layers': async () => {
    const { data } = await supabaseAdmin().from('erp_inventory_cost_layers').select('id, sku_id, warehouse_id, costing_method, quantity_remaining, unit_cost, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const skuIds = [...new Set((data || []).map((r: any) => r.sku_id).filter(Boolean))] as string[];
    const whIds = [...new Set((data || []).map((r: any) => r.warehouse_id).filter(Boolean))] as string[];
    const skus = await skuCodes(skuIds);
    const whs = await warehouseNames(whIds);
    return (data || []).map((r: any) => ({
      id: r.id,
      sku: skus.get(r.sku_id) || String(r.sku_id || '—').slice(0, 8),
      warehouse: whs.get(r.warehouse_id) || '—',
      method: r.costing_method || '—',
      remaining: r.quantity_remaining ?? '—',
      unitCost: r.unit_cost != null ? money(Number(r.unit_cost)) : '—',
      created: fmtDate(r.created_at),
    }));
  },
  'inventory-lots': async () => {
    const { data } = await supabaseAdmin().from('erp_inventory_lots').select('id, sku_id, lot_number, manufacture_date, expiration_date, received_at, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const skuIds = [...new Set((data || []).map((r: any) => r.sku_id).filter(Boolean))] as string[];
    const skus = await skuCodes(skuIds);
    return (data || []).map((r: any) => ({
      id: r.id,
      lot: r.lot_number || '—',
      sku: skus.get(r.sku_id) || String(r.sku_id || '—').slice(0, 8),
      manufactured: fmtDate(r.manufacture_date),
      expires: fmtDate(r.expiration_date),
      received: fmtDate(r.received_at),
      status: cap(String(r.status || '').replace(/_/g, ' ')),
    }));
  },
  'inventory-movements': async () => {
    const { data } = await supabaseAdmin().from('erp_inventory_movements').select('id, movement_type, sku_id, warehouse_id, quantity, unit_cost, total_cost, reference, occurred_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('occurred_at', { ascending: false }).limit(200);
    const skuIds = [...new Set((data || []).map((r: any) => r.sku_id).filter(Boolean))] as string[];
    const whIds = [...new Set((data || []).map((r: any) => r.warehouse_id).filter(Boolean))] as string[];
    const skus = await skuCodes(skuIds);
    const whs = await warehouseNames(whIds);
    return (data || []).map((r: any) => ({
      id: r.id,
      date: fmtDate(r.occurred_at || r.created_at),
      type: String(r.movement_type || '').replace(/_/g, ' '),
      sku: skus.get(r.sku_id) || String(r.sku_id || '—').slice(0, 8),
      warehouse: whs.get(r.warehouse_id) || '—',
      qty: r.quantity ?? '—',
      unitCost: r.unit_cost != null ? money(Number(r.unit_cost)) : '—',
      total: r.total_cost != null ? money(Number(r.total_cost)) : '—',
      reference: r.reference || '—',
    }));
  },
  'inventory-reservations': async () => {
    const { data } = await supabaseAdmin().from('erp_inventory_reservations').select('id, sku_id, source_order_id, quantity, status, expires_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const skuIds = [...new Set((data || []).map((r: any) => r.sku_id).filter(Boolean))] as string[];
    const orderIds = [...new Set((data || []).map((r: any) => r.source_order_id).filter(Boolean))] as string[];
    const skus = await skuCodes(skuIds);
    const orderNo = new Map<string, string>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const { data: orders } = await supabaseAdmin().from('erp_orders').select('id, order_number').in('id', orderIds.slice(i, i + 100));
      for (const o of orders || []) orderNo.set(o.id, o.order_number);
    }
    return (data || []).map((r: any) => ({
      id: r.id,
      sku: skus.get(r.sku_id) || String(r.sku_id || '—').slice(0, 8),
      order: orderNo.get(r.source_order_id) || '—',
      qty: r.quantity ?? '—',
      status: cap(String(r.status || '').replace(/_/g, ' ')),
      expires: fmtDate(r.expires_at),
      created: fmtDate(r.created_at),
    }));
  },
  'inventory-serial-numbers': async () => {
    const { data } = await supabaseAdmin().from('erp_inventory_serial_numbers').select('id, sku_id, serial_number, lot_id, status, location_id, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
    const skuIds = [...new Set((data || []).map((r: any) => r.sku_id).filter(Boolean))] as string[];
    const skus = await skuCodes(skuIds);
    return (data || []).map((r: any) => ({
      id: r.id,
      serial: r.serial_number || '—',
      sku: skus.get(r.sku_id) || String(r.sku_id || '—').slice(0, 8),
      lot: r.lot_id ? String(r.lot_id).slice(0, 8) : '—',
      status: cap(String(r.status || '').replace(/_/g, ' ')),
      location: r.location_id ? String(r.location_id).slice(0, 8) : '—',
      created: fmtDate(r.created_at),
    }));
  },
};

/* Generic fallback for DB-registered screens: a screen in
   platform_feature_tree_coverage with a backing table but no
   hand-written loader above serves its table's rows directly
   (tenant-scoped via TABLE_REGISTRY). Before this fallback existed,
   every such screen — Integrations among them — rendered a dead
   empty list no matter what its table held. */
const NAME_KEYS = ['name', 'title', 'label', 'display_name', 'legal_name', 'subject', 'code', 'slug', 'email', 'order_number', 'invoice_number', 'ticket_ref', 'reference', 'key', 'provider', 'network', 'handle'];
async function genericScreenRows(screen: string): Promise<{ rows: Row[]; table: string } | null> {
  const sb = supabaseAdmin();
  const { data: tree } = await sb
    .from('platform_feature_tree_coverage')
    .select('feature_path, module, backing_table')
    .not('backing_table', 'is', null);
  const wanted = new Set([screen, screen.replace(/_/g, '-'), screen.replace(/-/g, '_')]);
  const entries: { id: string; slug: string; table: string }[] = [];
  for (const row of tree || []) {
    const parts = (row.feature_path || '').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const moduleKey = row.module || parts[0].toLowerCase().replace(/\s+/g, '_');
    const id = `${moduleKey}-${parts.slice(1).join('--').toLowerCase().replace(/\s+/g, '-')}`;
    const cut = id.indexOf('--');
    entries.push({ id, slug: cut >= 0 ? id.slice(cut + 2) : id, table: row.backing_table as string });
  }
  let table: string | null = null;
  for (const e of entries) {
    if (wanted.has(e.id)) { table = e.table; break; }
  }
  if (!table) {
    // The nav merge renames a DB screen to its slug (the part after '--')
    // when the slug doesn't collide with a static screen, and callers may
    // ask for that slug. Resolve it only when every tree row carrying the
    // slug points at the same backing table — an ambiguous slug stays
    // unresolved rather than serving the wrong table's rows.
    const slugTables = new Set(entries.filter((e) => wanted.has(e.slug)).map((e) => e.table));
    if (slugTables.size === 1) table = [...slugTables][0];
  }
  if (!table) return null;
  const reg = TABLE_REGISTRY[table];
  let data: unknown[] | null = null;
  if (reg) {
    let q = sb.from(table).select(reg.columns.join(', ')).limit(200);
    if (reg.tenant) q = q.eq('tenant_id', DEFAULT_TENANT_ID);
    if (reg.columns.includes('created_at')) q = q.order('created_at', { ascending: false });
    const res = await q;
    if (res.error) return null;
    data = res.data;
  } else {
    // Tables with a hand-written API (ad_campaigns, products, …) were
    // never entered in TABLE_REGISTRY. Serve them with select('*'),
    // relaxing the query if tenant_id / created_at are absent.
    const attempts = [
      () => sb.from(table).select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200),
      () => sb.from(table).select('*').eq('tenant_id', DEFAULT_TENANT_ID).limit(200),
      () => sb.from(table).select('*').limit(200),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      if (!res.error) { data = res.data; break; }
    }
    if (!data) return null;
  }
  const rows: Row[] = ((data || []) as Record<string, unknown>[]).map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = v;
      else if (typeof v === 'boolean') out[k] = v ? 'Yes' : 'No';
      else if (v === null || v === undefined) out[k] = '—';
    }
    const nameKey = NAME_KEYS.find((k) => typeof r[k] === 'string' && (r[k] as string).trim());
    out.name = nameKey ? String(r[nameKey]) : String(r.id || '—').slice(0, 8);
    out.status = typeof r.status === 'string'
      ? cap(String(r.status).replace(/_/g, ' '))
      : typeof r.state === 'string'
        ? cap(String(r.state).replace(/_/g, ' '))
        : '—';
    out.updated = fmtDate((r.updated_at as string) || (r.created_at as string) || null);
    out.created = fmtDate((r.created_at as string) || null);
    return out;
  });
  return { rows, table };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const screen = searchParams.get('screen') || '';
  const table = searchParams.get('table') || '';
  // Callers may pass the nav id (sales-channels) or the def key
  // (sales_channels); the loaders are keyed by nav id.
  const loader = LOADERS[screen] || LOADERS[screen.replace(/_/g, '-')] || LOADERS[screen.replace(/-/g, '_')];
  if (!loader) {
    // Main's slug/dbId resolution first: genericScreenRows resolves the
    // screen (or its dbId) against the feature tree. If that finds nothing,
    // fall back to agent-B's explicit &table= allow-listed fallback.
    const generic = await genericScreenRows(screen).catch(() => null);
    if (generic) return NextResponse.json({ data: generic.rows, meta: { screen, count: generic.rows.length, table: generic.table } });
    // Generic table fallback: a screen with no hand-written loader still
    // shows its real rows when its nav backing table is readable. The
    // table name is allow-listed — registry tables plus every backing
    // table named in the live nav tree — so the client cannot probe
    // arbitrary tables through this endpoint.
    if (table) {
      try {
        const rows = await tableFallbackRows(table);
        if (rows) return NextResponse.json({ data: rows, meta: { screen, table, count: rows.length, fallback: 'table' } });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err('LOAD_FAILED', message, 500);
      }
    }
    return err('UNKNOWN_SCREEN', `No live mapping for list screen '${screen}'.`, 404);
  }
  try {
    const rows = await loader();
    return NextResponse.json({ data: rows, meta: { screen, count: rows.length, table: SCREEN_TABLES[screen] || null } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err('LOAD_FAILED', message, 500);
  }
}

let navTablesCache: Set<string> | null = null;

/** Tables the generic fallback may read: the data-layer registry plus
 *  every backing table named in the live nav tree. */
async function allowedTables(): Promise<Set<string>> {
  if (navTablesCache) return navTablesCache;
  const allowed = new Set<string>();
  try {
    const { TABLE_REGISTRY } = await import('@/lib/tableRegistry');
    for (const k of Object.keys(TABLE_REGISTRY)) allowed.add(k);
  } catch {
    // registry unavailable — nav tables still apply
  }
  try {
    const { data } = await supabaseAdmin().from('platform_feature_tree_coverage').select('backing_table').limit(2000);
    for (const r of data || []) {
      const t = (r as { backing_table?: string }).backing_table;
      if (t) allowed.add(t);
    }
  } catch {
    // nav unreadable — registry alone applies
  }
  navTablesCache = allowed;
  return allowed;
}

/** Raw rows for a generic list: tenant-scoped when the table carries
 *  tenant_id, unscoped (capped) for shared tables and views. Returns
 *  null when the table is not allow-listed. */
async function tableFallbackRows(table: string): Promise<Row[] | null> {
  const allowed = await allowedTables();
  if (!allowed.has(table)) return null;
  const shape = (r: Record<string, unknown>): Row => {
    const row: Row = { id: String(r.id ?? '') };
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id') continue;
      row[k] = v == null ? '—' : typeof v === 'number' ? v : typeof v === 'string' ? v : JSON.stringify(v);
    }
    return row;
  };
  const scoped = await supabaseAdmin().from(table).select('*').eq('tenant_id', DEFAULT_TENANT_ID).limit(200);
  if (!scoped.error) return (scoped.data || []).map(shape);
  // No tenant_id column (shared table / view) — read unscoped, capped.
  const unscoped = await supabaseAdmin().from(table).select('*').limit(200);
  if (unscoped.error) throw new Error(unscoped.error.message);
  return (unscoped.data || []).map(shape);
}
