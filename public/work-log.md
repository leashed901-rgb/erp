# ERP Wiring Work Log (revised — integrated view)

**Architecture:** This is **integrated software**. There are no duplicates and no dead orphans. The same data appears in different formats across domains (a customer in CRM, a register line in Finance, an action on a profile — all joined). If a component exists, it is intentional; the job is to **verify its live data source** (it may live under another heading or domain) and **join it**, not delete it.

**Database:** Supabase project `pcwwvfgxnrglmmpbfqhf`. Verified live.

---

## 1. Cross-domain data map (verified against the live DB)

What looks like "finance" often lives in CRM/Settings. These are not missing — they're joined:

| Concept (appears in Finance nav) | Actually lives in | Live table(s) | Rows |
|---|---|---|---|
| `entities` | **Contacts** (CRM parties) | `parties`, `crm_customers` | 24 customers |
| `contractors` | **Settings → Teammates** (a role on staff) | `crm_staff`, `profiles` | 1 staff, 2 profiles |
| `1099s` | **Settings → Teammates** (a flag/role on staff) | `crm_staff` (no standalone 1099 table exists) | — |
| Registers (`RegistersScreen`) | **Chart of Accounts** — a register view of the journal | `acct_journal_lines` | 120 |
| KPIs (`KpiScreen`) | the **Overview** screen (already renders KPIs) | overview aggregate | — |
| Finance actions on a party | **Customer profile in CRM** (actions tab) | `crm_tasks` | 5 |

There is **no** `crm_contractors`, `crm_1099s`, `tax_1099s`, or standalone `entities` table — confirming these are roles/views on existing contacts & teammates, not separate surfaces to build.

---

## 2. What was wired this session

### System-wide: reconciled the working dir against the master repo (unleashe.git apps/web)

The working dir (`erp.git`) was NOT actually audited against the master monorepo until now. Reconciling surfaced 3 critical differences — all fixed:

1. **System date/time was hardcoded.** `Header.tsx:210` had a static `Sun, Nov 1, 2026` string in the top bar. → Replaced with a live, hydration-safe clock (`new Date().toLocaleDateString`, client-only `useEffect`, 15-min drift guard). Now shows **Tue, Nov 17, 2026** (the real system date).
2. **Landing dashboard was the MOCK version.** The working dir's `OverviewViews.tsx` had hardcoded values (`$482,940` GMV, `5,640` orders, `"Oct 2026 default"`) — 1,375 lines different from the master repo's LIVE version. `dashboardController.ts` differed by 354 lines. → Replaced both with the master repo's live versions (which import `loadOrders`/`loadOverview`/`loadPnl`/`monthStart`/`quarterStart` from `dashboardAnalytics` and compute from real data). Dashboard now fires `/api/accounting/reports/pnl?from=2026-11-01&to=2026-11-17` (MTD→today) + `/api/accounting/overview`.
3. **Leaked service-role key was still hardcoded.** The working dir's `supabaseConfig.ts` kept the service-role key as a hardcoded fallback. The master repo's version says: *"the service-role key was removed from this file after it leaked… treat the old key as fully public/compromised… rotate it… every value now comes from env, fail-fast."* → Replaced with the master repo's secure version (env-only, no hardcoded key). App still serves HTTP 200 (env vars present).

### RECONCILED: all 14 lib/ files now match the master repo

**10 self-contained files** copied directly from the master repo (richer/canonical logic): `supabaseAdmin.ts`, `connect.ts` (+verify.body, MCP handshake), `platformStore.ts` (+skuId), `accountingTypes.ts` (canonical acct_estimates reconciliation), `fulfillment.ts` (live `erp_order_lines` vs legacy `order_items`), `renderWorker.ts` (craft_jobs queue), `podApi.ts`, `podServer.ts` (categoryAliases bridge), `blankIngest.ts` (placement→ViewAngle), `designCanvasStore.ts` (listAssets/listCollections/listDesigns).

**4 files referenced `@platform/shared`** (the monorepo's shared type package): `partyMirror.ts` (+`toSharedParty`), `contracts.ts` (+`toPartyCore`, canonical Party/Item/Document types), `crmTypes.ts` (+`scoreBandFor`, CrmDealStageHistoryRow), `partySpine.ts`. Created a local `src/lib/sharedContract.ts` (the 68-line @platform/shared canonical types: Party, Item, Document, MoneyMovement, Account, Result) and repointed all 4 files to it. **0 `@platform/shared` references remain** in src.

### Module 1: CRM (contacts) — every component wired to its live data source

**5 new screen-level components wired** (were defined but never rendered — now reachable in the CRM Tools sidebar + rendering live data):
| Component | screenId | Live data source | Verified |
|---|---|---|---|
| `PipelinesScreen` | `pipelines` | `/api/crm/pipelines` (2) + `/api/crm/pipeline-stages` | ✓ 2 pipelines + stages |
| `SequencesScreen` | `sequences` | `/api/crm/sequences` + `sequence-steps` + `sequence-enrollments` | wired (same pattern) |
| `LeadScoringScreen` | `lead-scoring` | `/api/crm/lead-scoring-rules` (6) + `lead-score-bands` | ✓ 6 rules |
| `RouteBuilderScreen` | `route-builder` | `/api/crm/routes` + `routes/build` + appointments/staff/parties | wired |
| `TrackedRecordsScreen` | `tracked-records` | `/api/crm/data/crm_record_types` + `record_parties` + `record-events` | ✓ record types |

**CustomerProfile wired** — the customer-specific rich profile (finance actions/layers, `useCrmCustomer` → `/api/crm/customers/:id`). Was rendered nowhere; now `CustomersSupabase` opens it on row click (replacing the generic `PartyProfile` for the customers screen). Data source verified: `/api/crm/customers/:id` returns the full profile (household, lifecycle_stage, etc.). `PartyProfile` stays used by `ContactsParties` + `CrmOverviewSupabase` for generic parties.

**MailQuickAction wired** — the mail compose modal (`/api/crm/templates` + `/api/parties`). Was orphaned; now wired into `OrderDetailPage`'s "Email customer" button (replaced the `onToast('Opening email composer...')` stub). Same stub still in `SupportTicketsScreen:152` (support domain — wire next pass).

**Already-wired (verified present):** `AppointmentsScreen`, `ContactsParties`, `CrmOverviewSupabase`, `CustomersSupabase`, `DealsWorkbench`, `LeadsPipelineSupabase`, `MailboxInbox`, `StatementsScreen` — all render live data. Sub-components `PartyFormDrawer` (5 uses), `PartyProfile` (3), `PartyAdditionalTabs` (1), `SequencingTab` (1), `EstimatesScreen` (2) — all used by parent screens.

**Remaining CRM sub-component (alternate-format):** `PipelineBuilder`/`StageManager` — a stage-manager view over `/api/crm/pipeline-stages`. `PipelinesScreen` has its own stage UI; `StageManager` is the alternate detailed format — to integrate as a stage-management view within Pipelines. `CrmOverviewScreen` + `CustomersScreen` are the design-format alternates of `CrmOverviewSupabase` + `CustomersSupabase` (same data, different format — the Supabase variants are the live renderers).

### A. Fixed the silent-empty-list bug across 6 hooks (41 broken transforms)
`useList` passed the inner array to transforms that expected the wrapper → every list returned `[]`. Fixed with a `rows<T>()` helper that handles both shapes.

| Hook | Sites | Screens unblocked |
|---|---|---|
| `useAccountingApi` | 10 | Chart of Accounts (193 rows), Bank Accounts, Bank Transactions, Bank Rules, Receipts, Bills, Vendors, Estimates, Customers, Report views |
| `useAdvertisingApi` | 9 | Ad campaigns, sets, creatives, audiences, advertisers, accounts, spend, pixels, events |
| `useMarketingApi` | 7 | Promotions, campaigns, stats, subscribers, suppressions, automations, webforms |
| `useSocialApi` | 6 | Posts, accounts, schedule slots, media, oversight, performance |
| `useCmsApi` | 6 | Pages, blocks, banners, popups, navigation, redirects |
| `useSupportApi` | 4 | Tickets, KB, macros, config |
| `useTasksApi` | 10 | Tasks board, projects, agenda, reminders, calendars, events, notifications, announcements, following, chat |

### B. Wired the native Integrations page
`IntegrationsCatalog` ("our own connection layer — no middleman", 748 Activepieces pieces + Nango auth configs, verified against provider APIs). Was defined but never rendered → wired `set-integrations` → render case + `WS_SCREEN_IDS` + nav card + imported the missing `/api/integrations/disconnect` route. (The `/api/integrations/composio` route is a separate, unused aggregator.)

### C. Wired 3 Finance screenIds to their existing view components
| screenId | Component | Data source |
|---|---|---|
| `liabilities-credit` | `LiabilitiesScreen` | debt instruments |
| `payroll` | `PayrollScreen` | `/api/payroll/runs`, `/employees`, `/periods` (live) |
| `expenses` | `ExpenseReportsScreen` | expense reports |

### D. Wired Catalog `studio-my-collections` → `CollectionScreen` (was falling to empty ListView).

---

## 3. Verified working in browser (zero console errors)
- Chart of Accounts: **193 live rows** (was empty before the hook fix)
- Payroll: live `/api/payroll/runs`, `/employees`, `/periods`
- Integrations: native catalog renders, `/api/integrations/catalog` 200
- Tasks board: live `crm_tasks`, create + drag-drop working

---

## 4. Remaining verification work (holistic — not "missing screens")

For each existing component below, the next step is to **verify its live data source and wire/join it** — not to build or delete anything. These are alternate-format views that need their (often cross-domain) data source confirmed:

### Finance — components that are alternate views of integrated data
- `RegistersScreen` → account registers = a view over `acct_journal_lines` (120 rows). Wire as a register view of the COA.
- `KpiScreen` → KPIs already shown in the Overview; wire as the KPI drill-down or fold into overview.
- `AllocationsScreen`, `CloseScreen`, `FixedAssetsScreen`, `RevenueScreen`, `BudgetsScreen`, `ConsolidationScreen`, `DimensionsScreen`, `WorkflowsScreen`, `PriceBooksScreen`, `RecurringScreen`, `ReferenceScreen` → these are **actions/views on the customer profile (CRM)** or finance workflows. Each has a corresponding API route — verify the table (likely cross-domain) and join.
- `entities` (screenId) → maps to **Contacts** (parties). Point it at the contacts surface, don't build a new one.
- `contractors`, `1099s` (screenIds) → map to **Settings → Teammates** (roles on `crm_staff`). Point them there.

### CRM — the `*Screen` and `*Supabase` variants are the SAME data in different formats
`CrmOverviewScreen`/`CrmOverviewSupabase`, `CustomersScreen`/`CustomersSupabase`, etc. — not duplicates. One is often the design reference, the other the live-data renderer. Verify each renders its joined CRM data; the "orphan" is typically the design-format variant that should be wired to the same data source as its Supabase sibling.

### Orders
- `OrdersWorkbench` → verify its data source (orders + fulfillment joined); wire as the workbench view of orders.
- `shipping-settings` → rendered but no nav entry; add the shellData entry.

### Catalog
- The design `*Screen` variants (`StudioDesignPreviewScreen`, `TechPackPreviewScreen`, `FreehandDesignerScreen`, `RfqBoardScreen`, `TechPackEditorScreen`, `RfqsListScreen`, `TechPacksListScreen`, `ProductPageScreen`, `ChannelsScreen`, `BlanksScreen`, `CatalogWorkbench`) → alternate views of catalog/design data. Verify each against its API + table and wire.
- `collection`, `published`, `wizard-*` screenIds render but have no shellData entry → add hidden entries so tabs resolve correct labels.
- `studio-my-stores` has two render paths → pick the canonical one.

### Hooks still to verify (domains not audited this pass)
Marketing / Social / CMS / Advertising / Support hooks are fixed (rows bug), but their screen→data wiring wasn't audited. Same approach: verify each component's live table, join cross-domain where needed.

---

## 5. The mental model going forward
- **No component is dead.** If it exists, it has a purpose — find the data, join it, wire it.
- **Same data, different formats.** A "duplicate" is usually a design-format view + a live-data view of the same joined data.
- **Cross-domain joins are the norm.** Finance actions live on the CRM customer profile; entities are contacts; contractors/1099 are teammates; registers are the journal.
- **Verify the live DB first.** If a table isn't where you expect, it's under another heading — join it.
