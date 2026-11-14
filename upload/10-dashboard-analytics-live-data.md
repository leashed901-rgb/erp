# Dashboard, Stat Bars & Analytics Views — How the Data Flows, and the Path Off Mock

### The honest answer about every chart, KPI tile, and overview number in the client today

---

## Part 1 — How it actually works today (verified in the source)

### The dashboard runs on one static file

Every dashboard screen — **Ops, Exec, Analytics, Explorer, Attention queue, Customer queue, Seller queue** — gets 100% of its data from a single file: `src/data/dashboardData.ts` (1,417 lines). It is a list of hardcoded constants: `MONTHLY_GMV_SERIES`, `GMV_WATERFALL_BRIDGE`, `CATEGORY_MARGINS`, `CHANNEL_PERFORMANCE`, `SUPPLIER_MARGINS`, `OPS_VITALS_BY_WINDOW`, `OPS_PIPELINE_FUNNEL`, `COHORT_RETENTION_ROWS`, `TOP_SKU_ANALYTICS`, `ATTRIBUTION_CHANNELS`, `EXPLORER_DATASETS`, `INITIAL_ATTENTION_QUEUE`, `INITIAL_CUSTOMER_QUEUE`, `INITIAL_SELLER_QUEUE`, and more.

`useDashboardController` (in `src/components/dashboard/dashboardController.ts`) holds these in `useState` and serves them to the screens. **No fetch, no Supabase client, no API call appears anywhere in the dashboard components.** When a user "resolves" an attention item, the controller only flips local state — refresh the page and it's back.

### The Recharts question, answered directly

**Recharts is not calling any data — it isn't being called at all.** The project contains `src/components/ui/chart.tsx`, the standard shadcn/ui Recharts wrapper (`ChartContainer`, `ChartTooltip`, `ChartLegend` around `ResponsiveContainer`). **Nothing in the entire client imports it.** Every visual on the dashboard and overview pages is hand-drawn: inline `<svg><rect>` bars (`barSvg`) and CSS divs whose widths are percentages of a hardcoded max value. So there is no chart-data wiring to describe — the mock constants feed the SVG bars directly, and the Recharts wrapper is installed but dead weight until a screen adopts it.

### The stat bars and KPI tiles are literal strings

The KPI tiles at the top of each view are `const kpis = [...]` arrays declared inside the view functions in `OverviewViews.tsx` and `AnalyticsViews.tsx` — literal values like `$482,940`, `+8.4% vs prior`, `58.4% margin`. They are not computed from anything.

### The overview pages, one by one

| Screen | Where its numbers come from | Status |
|---|---|---|
| Dashboard (all 7 views) | `data/dashboardData.ts` constants via `useDashboardController` | **MOCK** |
| Sales overview | `usePlatformStore` seeds (documents, parties, moneyMovements) | **SEED** |
| Accounting overview | inline constants in the file (`INITIAL_CHECKLIST`, `INITIAL_RECEIPTS`, bank transactions, activity feed — "Chase •9910 linked", "34 accounts mapped") | **MOCK** |
| Support overview | **LIVE** — `GET /api/v1/support/overview` reads `support_tickets` + `crm_staff` | **LIVE** |
| Business tax overview / tax summary | local constants in `business-tax/types.ts` | **MOCK** |
| Ad spend, pixels | inline constants in the screen files | **MOCK** |
| Reports screen | inline constants | **MOCK** |
| Chart of accounts screen | `usePlatformStore` seeds | **SEED** |
| Cap table screens | `data/capTableData.ts` — a fictional company ("Unsaid", Delaware C-Corp) | **MOCK** (see correction below) |

**The one working template is the Support overview screen.** It does `useEffect` → `fetch('/api/v1/support/overview')` → loading state → render, and the route reads real tables with tenant scoping. Every other overview page should be rebuilt to this pattern.

### A correction to the earlier package

The module guide marked Cap Table as LIVE. That was overstated: the API family (`/api/cap/*`, `/api/cap/plans`, `/api/cap/snapshots`, `/api/cap/transactions`, `/api/cap/approvals`, `/api/equity/state`) is fully built, but **no component in the client fetches any of it** — the screens render the static `capTableData.ts`. The equity/valuation math engines are real code; the screens just don't call the API yet. The module document (`02-modules/28-cap-table.md`) has been corrected to PARTIAL with this explanation.

---

## Part 2 — What the database already has for this

The schema is ahead of the client here. Most of the "analytics" the dashboard fakes already have reporting surfaces in the database:

| Database object | What it gives you |
|---|---|
| `acct_v_monthly_pnl` (view) | Monthly profit & loss — the GMV/revenue/margin series the Exec view fakes |
| `acct_v_ar_aging` / `acct_v_ap_aging` (views) | Receivables and payables aging buckets |
| `acct_v_sales_funnel` / `acct_v_bill_funnel` (views) | The pipeline funnels the Ops view fakes |
| `acct_v_spend_by_category` (view) | Spend breakdown by category |
| `acct_v_undeposited_payments` (view) | Undeposited funds (the deposit flow) |
| `acct_v_tasks_due` (view) | Overdue work for the attention queue |
| `acct_report_snapshots` (table) | Saved report packages as JSONB, with `acct_publish_report_package` |
| `acct_reconciliation_summary` (RPC) | Bank reconciliation health |
| `acct_calculate_tax_summary` (RPC) | Tax summary for the tax overview |
| `erp_stock_history` (RPC) | Inventory movement for ops vitals |
| `platform_dashboards` / `platform_dashboard_widgets` / `platform_kpi_targets` (tables, S400) | **Per-tenant dashboard configuration and KPI targets — the dashboard system of record, currently unconsumed by the client** |
| Source tables | `erp_orders` + `erp_order_lines` (GMV, AOV, orders), `acct_channel_settlements` + lines (channel performance), `acct_ar_invoices` (unpaid/overdue), `products`/`product_variants`/`categories` (category margins), `crm_customers` (cohorts), `support_tickets` (support vitals), `acct_ap_bills`/`acct_vendors` (supplier margins) |

---

## Part 3 — The mapping: every dashboard visual → the table it should read

| Dashboard element (today's mock) | Live source | How |
|---|---|---|
| GMV / Net Revenue / Gross Profit / Contribution / AOV / Orders KPIs | `acct_v_monthly_pnl` + `erp_orders` | One SQL query per window (MTD/QTD/YTD/12M) |
| Monthly GMV series chart | `acct_v_monthly_pnl` (or daily rollup of `erp_orders` for 30D) | Return as `{month, gmv, net, profit}[]` |
| Channel performance bars | `acct_channel_settlements` + lines, keyed by `acct_channel_accounts` | Sum settlements per channel in window |
| GMV waterfall bridge | settlements + `acct_ar_receipts` + `acct_v_undeposited_payments` | Deposited vs undeposited vs fees per period |
| Category margins table | `categories`/`products` joined to `erp_order_lines` | Revenue minus COGS per category |
| Supplier margins | `acct_ap_bills`/`acct_vendors` + `erp_purchase_orders` | Spend and margin per vendor |
| Ops vitals tiles (Today/7D/30D/MTD) | `erp_orders`, shipments (`erp_mark_shipped` events), `support_tickets` | Count queries per window |
| Ops pipeline funnel | `acct_v_sales_funnel` / `acct_v_bill_funnel` | Direct view reads |
| Conversion funnel | `erp_orders` + commerce events | Sessions → orders conversion |
| Cohort retention rows | `crm_customers` first-order date + `erp_orders` | Group by first-order month |
| Top SKU analytics | `product_variants` + `erp_order_lines` | Rank by units and revenue |
| Attribution channels | ad-center/marketing tables + channel orders | Channel-tagged revenue |
| Attention queue | alert states already in tables: overdue `acct_ar_invoices`, low-stock inventory, SLA-risk `support_tickets`, unreconciled `acct_reconciliations`, `acct_v_tasks_due` | Union of small queries |
| Integration vitals | `acct_channel_accounts` sync status + `acct_processor_events` | Latest sync per channel |
| Explorer datasets (Orders & GMV, Products & SKUs, Customer Cohorts, Seller Ledger) | same sources as above, filtered/sorted | The endpoint takes dataset key + view |
| KPI targets ("vs plan") | `platform_kpi_targets` | Join targets to actuals |
| Which tiles appear on which dashboard | `platform_dashboards` + `platform_dashboard_widgets` | Per-tenant dashboard config |

---

## Part 4 — The path off mock, in order

1. **Build one endpoint: `GET /dashboard/tiles`** (it is already on the planned-endpoints list in `04-api-reference.md`). It takes `view` (ops/exec/analytics/explorer), `window` (today/7d/30d/mtd/qtd/ytd/12m), and `dataset` where relevant, and returns the exact payload shapes the dashboard already consumes — the TypeScript types in `dashboardData.ts` stay as the contract; only the source changes from constant to response. The views above (with tenant RLS) do most of the work; nothing new needs inventing.
2. **Point `useDashboardController` at it.** Add a query hook (TanStack Query is already in the stack) beside the existing `useState`, keep the constants as the loading/fallback state, and pass live rows into the same views. This single change converts all seven dashboard screens.
3. **Wire the dashboard config tables.** Read `platform_dashboards`/`platform_dashboard_widgets` so a tenant's dashboard layout and tile set come from the database — the same pattern as tenant nav. Feed `platform_kpi_targets` into the "vs prior / vs plan" deltas.
4. **Rebuild each module overview page on the Support overview pattern** (`useEffect` → fetch → loading → render, route reads tables with tenant RLS): Sales, Accounting, Business Tax, Ad Spend, Pixels, Reports. Each needs only its own `/overview` route returning KPIs + series.
5. **Re-point the cap table screens** at the already-built `/api/cap/*` and `/api/equity/state` routes — the API and the screens exist; only the fetch layer is missing.
6. **Decide the chart library once.** Either adopt the existing `ui/chart.tsx` Recharts wrapper for the series visuals (line/area/bar charts) or remove it; today it is installed but unused. The simple SVG bars are fine for single-value comparisons; anything with axes, series, or tooltips should use the wrapper so hover, tooltip, and responsive behavior are consistent.

**The one-sentence version:** the dashboard's mock data lives in one file, the schema already contains reporting views, KPI-target tables, and dashboard-config tables for nearly everything the dashboard fakes, and the Support overview screen is the working example of the pattern every other screen should copy.
