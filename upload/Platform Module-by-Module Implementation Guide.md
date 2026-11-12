# The Platform, Module by Module
### A plain-language guide to how every screen, action, and connection works

**What this document is.** This is the working guide to the platform — written for the people building it and the people scaffolding it for clients. It explains, module by module: what each module is in plain language, what its screens look like, what happens when you click every button, how each action flows into the other modules — and then grounds all of it in the actual code (`src/` components, API routes, types) and the actual database (tables and RPCs by name), so every statement about "what exists" can be checked against the repo. It ends with the gap register (what TypeScript types, APIs, and RPCs still need to exist) and the client-packaging system that lets a veterinary practice and a retail store run the same product differently.

**How to use it.** Read Part 1 once — it explains the small set of rules every module obeys, which is what makes the platform feel integrated. Part 2 sets the status legend and the honest state of the build. Part 3 maps the shared logic to real code. Part 4 is the module-by-module reference (19 modules). Part 5 is the consolidated gap register, Part 6 the client packaging, Part 7 the status rollup and build order.

---

# PART 1 — How the whole platform thinks

Before the modules, six ideas. Everything else in this document is just these ideas applied over and over.

## 1.1 Five shared records hold the whole platform together

Every "thing" in the platform — every product, invoice, customer, payout, bill — is one of five kinds of records. Modules are not separate apps with separate data; they are different *views* over these five shared records. This is the single most important idea in the platform, because it is what makes one action ripple everywhere:

| Record | What it is, in plain terms | Where it shows up |
|---|---|---|
| **Party** | One person or company. A party can wear many hats at once: customer, vendor, supplier, contractor, marketplace seller, lead. | Sales, Expenses, CRM, Orders, Support, Taxes, Marketplace |
| **Item** | Anything you can sell or buy: a product, a service, a blank t-shirt, a bundle, a gift card, a subscription. | Catalog, Studio, Invoices, Bills, Purchase Orders, Orders, Inventory, Sales channels |
| **Document** | Any multi-line transaction: Invoice, Estimate, Sales Order, Bill, Expense, Check, Purchase Order, Credit Memo, Vendor Credit, Return, Journal Entry. | Sales, Expenses, Orders, Purchasing, Returns, Accounting |
| **Money movement** | Cash actually moving: a payment, a payment link, a deposit, a bank transfer, a payout, a refund. | Sales, Bills, Banking, Reconciliation, Stripe/Shopify |
| **Account** | A node in the books: a Chart of Accounts entry, a bank account, a credit card, a loan, a line of credit. | Accounting, every document line, Reconciliation, Taxes, Reports |

Two consequences of this, and they are deliberate design decisions:

- **"Add customer," "add vendor," "add supplier," "add contractor," and "add seller" are all the same drawer** — the Party drawer — just opened with a different default role. The platform never builds four forms for the same job.
- **Every document is rendered by one engine.** An invoice, a bill, and a purchase order all have a header, lines, totals, attachments, a memo, a status, and an activity timeline. They differ only in configuration — who the counterparty is, which columns the lines have, which status changes are legal, and where they post in the books. Build the engine once; every document type is a setting.

## 1.2 The surface ladder — which container for which job

There are six containers in the platform, and every action in this document uses exactly one of them. The rule is simple: the container matches the size of the job.

| Surface | Use it when | Examples |
|---|---|---|
| **Peek** (a small popover) | A read-only glance with zero commitment. Hover or click a pill. | Hover a customer's name → see their balance, last order, open tickets. |
| **Modal** (small centered dialog) | One decision, five fields or fewer, and the result is immediate. | Record a payment, void, refund, mark shipped, adjust stock, send, remind, approve a return, archive. |
| **Drawer** (slides in from the right; a wide mode exists) | Create or edit a single record while staying on the list. | Add a customer, vendor, product, account, category, task, note, ticket, banner, popup, discount code, collection. |
| **Document page** (full page) | Anything with multiple lines. | Invoice, bill, purchase order, sales order, estimate, credit memo, journal entry. |
| **Workspace** (a full-page working surface with steps) | Many records, one batch outcome. Saves as a draft batch. | Pay bills, receive payment, reconcile, batch print slips and labels, cycle count, upload multiple bills, run payroll. |
| **Studio** (a visual canvas) | Design work. | The t-shirt/product designer, the collection canvas, product mockups. |

**The escalation ladder:** peek → modal → drawer → full page. A user can always promote upward without losing what they've typed — a drawer can be made full-page and the input carries over. Small stays small by design; big work gets room.

## 1.3 The context envelope — the integration engine

This is the invisible part that makes the platform feel like one system. Every screen carries a small packet of context: who you were looking at, which order, which design, which account, which sales channel, and where to return when you're done.

- Create an invoice **from inside an order** → the customer, the line items, the channel, and the link back to the order are all prefilled.
- Create a bill **from a vendor's page** → the vendor, their payment terms, and their default expense category are prefilled, and any open purchase orders from that vendor appear as suggestions to match.
- Create a product **from a design in the Studio** → the design is attached, the blank picker opens, and the platform pre-calculates margins from the supplier's cost.
- Create an expense **from a bank transaction** → the amount, date, and paid-from account are prefilled; "Match" and "Create" sit side by side as siblings.

And when you close whatever you opened, you land back on the exact scroll position and tab you came from. No dead ends, no "where was I?"

**The Create menu follows the same logic:** it is one menu everywhere, reordered by where you are — in the Sales area the customer actions surface first; in the Catalog area the product, design, and marketing actions surface first. Never a different menu, just a different emphasis. The command palette (⌘K) searches that same menu, so "new invoice for Acme" works from anywhere.

## 1.4 Pills — every mention is a door

A pill is the small colored chip you'll see everywhere: a customer's name on an invoice row, a channel tag on an order, a status badge on a bill. Pills are not decoration; they are the connective tissue of the platform. There are six kinds, and each behaves the same everywhere:

| Pill | What it means | Click it | Right-click it |
|---|---|---|---|
| **Status** | Where a thing is in its life: Draft, Sent, Unpaid, Overdue, Paid, Shipped, For review, Approved… | Peek the next actions | Change the status |
| **Relation** | A linked record: "Order #1042," "Inv #88," "PO #12," "Design: Tee v3," "Ticket #301" | Peek popover | Open / open in new tab / unlink |
| **Party** | A customer, vendor, or seller with their role color and balance | Peek → open profile | Email / create something for them |
| **Channel** | Etsy, TikTok, Amazon, Shopify, Website, Store | Filter the list by channel | Open channel settings |
| **Alert** | Something needs a human: stock low, SLA at risk, unreconciled, missing W-9, needs attention | Opens the fix — the modal or drawer that solves it | Dismiss / snooze |
| **Tag** | User-defined label | Filter by tag | Edit tags |

**The cross-module rule:** a pill on one module's screen is always the door into another module. An overdue invoice row shows a Customer pill *and* a Ticket pill if that customer has an open support ticket. An order row shows an Invoice pill and a Shipment pill. If you can mention it, you can open it.

## 1.5 The right-click grammar — same menu, every list

Every list in the platform shares one right-click menu structure, in the same order, every time. Only the sections that apply to that record type appear:

1. **Open** — open, view, open in new tab
2. **Edit** — edit, duplicate
3. **Create from this ▸** — the cross-module menu: create an invoice, return, ticket, task, purchase order, credit memo, *from the thing you clicked*
4. **Communicate ▸** — email, send, remind, add note, open ticket
5. **Money ▸** — record payment, refund, mark paid, pay
6. **Print / Export ▸** — print, PDF, download attachment
7. **Organize ▸** — tag, add to…, favorite, pin
8. **Danger, always last, always confirmed:** archive, void, delete

Section 3 — **Create from this** — is what makes this platform different from an accounting package. Accounting apps let you manage records; this platform lets you start any workflow from any record, with the context already attached.

## 1.6 Scoped views and global hubs — the push pattern

A few things exist **twice on purpose**: Catalog, Contacts, Support, and Marketing each appear once as a *scoped view* inside the area where the work happens, and once as the *global hub* that is the system of record.

- **Why two?** A designer mid-design cannot bounce to the global catalog. A finance person should not open the CRM just to bill someone. The scoped view is fast and contextual; the global hub is governed and shared. The user never has to leave what they're doing to get or create what they need.
- **One record underneath.** A scoped view is a lens over a single global record. Pushing a scoped item to global never creates a second record. On push, the system checks for duplicates (by email, tax ID, SKU, or design ID) and offers: link to existing, merge, or create anyway.
- **State pills show the journey:** `Local only` → `Pushed` → `Live/Global`.
- **Edits work from either side.** Because there's only one record, an edit made in the scoped view or the global hub shows up in both immediately. The safeguard is a warning, not a redirect:
  - *Notice only* — local items need no warning.
  - *Existing-record banner* — editing a shared record shows "You're editing an existing record shared with the Global Catalog," an impact line ("Used in 14 products · 3 open invoices · 2 channels"), and a "View where used" link. Non-blocking.
  - *Confirm on save* — when an edit changes something with downstream effects (price, SKU, email, tax ID, terms, default account), saving shows a before → after summary with options to save, save and apply to open drafts, or cancel.
  - *Locked* — posted financial documents and reconciled transactions are never edited; the platform offers void, adjust, or credit memo instead.

## 1.7 What every list looks like

Every list in the platform — invoices, orders, products, tickets, accounts — shares one anatomy:

- **Toolbar:** search · saved views (filters) · date range · column picker · import (where supported) · export · the primary Create button.
- **Status tabs with counts:** e.g., Bills → *For review · Unpaid · Paid*. Tabs are filters, not toggles.
- **Columns:** a checkbox column, the primary identifier, the party pill, the status pill, …, the amount, the date, then a `⋯` row-actions button that mirrors the right-click menu. Every column sorts except Actions. The default sort is newest first, with overdue or attention items pinned to the top.
- **Row click** opens the record — a drawer for single records, a full page for documents. ⌘/Ctrl-click opens in a new tab.
- **Select rows** and a bulk bar appears: send, print, tag, archive, export, plus module-specific actions like approve, pay, or publish.
- **A totals footer** sums the visible amounts or open balances.
- **An empty state** that says one sentence, offers the primary action, and offers import.

## 1.8 Visibility — who sees what

Three layers decide what any user sees, and they apply everywhere automatically:

- **Roles & permissions** decide which modules appear at all, and whether the user can view, edit, or approve within them. The Create menu and right-click menus are filtered by permission — the menu never shows an action the user can't finish.
- **Approvals & limits** decide which actions need a second pair of eyes: bill approvals, payment approval thresholds, manager overrides at POS.
- **Field-level masking** hides sensitive fields (cost, margin, bank details, tax IDs) unless the role permits them. Relation pills to modules a user can't access show a count only, not the contents.

## 1.9 The tab system

The tabbed workspace already exists, and this platform treats it as the backbone: each tab owns its own stack of surfaces (its drawers, modals, and pages) and its own context envelope. Switching tabs never closes what you were doing; closing a tab with unsaved work asks first. This is how a person can run Pay bills in one tab while reviewing a design in another, without either losing its place.

---


Each module below follows the same shape: **what it is → when a client gets it (the pack) → the screens → the actions and where they open → the right-click menu → the pills → how it connects to everything else → where it stands today** (built, partial, or still to define). The full code-and-database marriage for every module is in Part 4; Part 6 shows how modules bundle per client type.

The modules are grouped into the seven areas of the left navigation:

| Area | Modules inside it |
|---|---|
| **Finance** | Sales & Getting Paid · Expenses, Bills & Vendors · Accounting & Banking · Business Tax |
| **Operations** | Orders & Fulfillment · Purchasing · Inventory · Returns & Claims |
| **Commerce** | Catalog & Channels · Design Studio · POS · Gift Cards |
| **Growth** | Contacts & CRM · Marketing, Social & Ads · Website/CMS |
| **People** | Team & Contractors · Employees & Payroll · Time |
| **Support** | Inbox & Tickets · Marketplace Sellers |
| **Foundations** | Tasks & Calendar · Reports · Dashboard · Cap Table · Settings |

---

# PART 2 — Read this first

This guide has three layers, and every module section below uses the same three, in the same order:

1. **What it is** — plain language: the screens, the columns, the drawers and modals, the right-click menu, the pills, and how the module hands context to every other module.
2. **Where the code is today** — the actual files in `src/` (components, hooks, types, stores) and the actual API routes, by name.
3. **Where the data is** — the actual database tables and stored procedures (RPCs) in the schema, by name, plus what is missing.

**Status legend used throughout:**

- **LIVE** — screen exists, wired to real database tables.
- **MIRROR** — screen exists but reads the client-side seeded store (`platformStore`) instead of the database. Looks done; is not.
- **PARTIAL** — some surfaces built, some missing.
- **MISSING** — schema may exist but no screen/API yet.

**The one-sentence state of the platform:** the shell, the surface system, the shared drawers, the document engine component, the CRM family, the cap table, the sellers/marketplace family, and the design studio/POD pipeline are built and mostly LIVE; the finance document screens (invoices, bills, estimates, receipts, purchase orders) are built but still read **seeded demo data**; and the server-driven pieces that make the platform *modular* — the module packs, the quick-action registry, tenant nav — exist **in the database but are not yet consumed by the client**.

---

# PART 3 — The shared logic, tied to real code

## 1.1 The five shared entities — and where they live in code

| Entity | Client type (file) | Database home |
|---|---|---|
| **Party** | `Party` in `src/lib/platformStore.ts`; `SupabasePartyRecord` in `src/lib/partyMirror.ts`; `crmTypes.ts` | `platform_parties`, `crm_customers`, `acct_vendors`, `crm_leads`, `sellers` (mirrored into one store on boot via `GET /api/parties`) |
| **Item** | `Item` in `platformStore.ts`; `CatalogProduct` in `designCanvasStore.ts` | `products`, `product_variants`, `erp_product_variants`, `categories`, `commerce_*` |
| **Document** | `Invoice`, `Bill`, `Estimate`, `Receipt` in `src/lib/accountingTypes.ts` | `acct_ar_invoices` + `acct_ar_invoice_lines`, `acct_ap_bills` + `acct_ap_bill_lines`, `acct_estimates`, `erp_orders`/`erp_order_lines`, `acct_spend_transactions` + `acct_spend_lines` |
| **Money movement** | `PaymentTransaction` in `accountingTypes.ts` | `acct_order_payments`, `acct_ap_payments` + applications, `acct_ar_receipts` + applications, `acct_channel_settlements` + lines, `acct_payouts`, `acct_bank_transactions`, `commerce_gift_cards` ledger |
| **Account** | `Account` in `platformStore.ts`; `chartOfAccounts.ts` (data) | `acct_chart_of_accounts`, `acct_bank_accounts`, `acct_journal_entries` (+lines) |

The store (`platformStore.ts`) is a client-side cache with seed rows; `partyMirror.ts` keeps it a **one-way mirror** of Supabase (writes always go through the API). This mirror pattern is the template every module should follow — see the gap register.

## 1.2 The surface system — built

`src/lib/surfaceStore.ts` implements the surface contract: `useSurfaces` (per-tab stack of drawers/modals/pages/workspaces, max depth 2, dirty flags), the context envelope (prefill), and permissions. `SurfaceHost.tsx` renders the active tab's stack. Every surface request carries `kind` (drawer/modal/page/workspace/peek), `surfaceId` (e.g. `party.drawer`, `invoice.page`, `pay-bills.workspace`), `recordId`, and `prefill`.

**Gap:** only `SurfaceHost` imports `useSurfaces`. Screens still manage their own local open/close state in places; every screen must route opens through the store so the envelope and the dirty guard actually apply everywhere.

## 1.3 The universal components — built

| Component (file in `src/components/`) | What it does |
|---|---|
| `GlobalShell.tsx` | The shell: tabs, rails, boot (mirrors parties on start) |
| `ScreenContent.tsx` | The screen router: nav id → screen component (~2,800 lines; the module map of the client) |
| `TableShell.tsx` + `ListPrimitives.tsx` | The list anatomy: toolbar, tabs-as-filters, sorts, column picker, bulk bar, totals footer, empty state |
| `RecordDrawer.tsx` | One drawer engine rendering `DrawerDef` configs — currently: `PARTY_DRAWER`, `ITEM_DRAWER`, `ACCOUNT_DRAWER`, `EXPENSE_DRAWER`, `TICKET_DRAWER`, `CATEGORY_DRAWER` |
| `UniversalPickers.tsx` | `PartyPicker`, `ItemPicker`, `AccountPicker` (typeahead + `+ Add new` inline create) |
| `UniversalModals.tsx` | `ModalShell`, `RecordPaymentModal`, `SendModal`, `VoidModal`, `ConfirmDialog`, plus `Pill` and `PeekPopover` |
| `DocumentEngine.tsx` | Renders any multi-line document (invoice, bill, PO, estimate) from one component |
| `PaymentModal.tsx`, `PeekDrawer.tsx`, `StatusPill.tsx` | Money modal, peek surface, status badge |
| `StudioDrawer.tsx` | Design studio entry surface |
| `CreateFlyout.tsx`, `QuickActionsDrawer.tsx`, `NavigationHubFlyout.tsx`, `FavoritesFlyout.tsx` | The Create menu and quick navigation |
| `Header.tsx`, `MainRail.tsx`, `SideRail.tsx`, `Toast.tsx` | Shell furniture |

**Missing from the spec's registry:** `TaskDrawer`, `DiscountDrawer`, `BannerDrawer`, `PopupDrawer`, `CollectionDrawer`, `RecurringDrawer` configs; the `CapturePanel` (OCR for bills/receipts); `ExistingRecordBanner` (the shared-record warning); `AttachmentStrip` as a standalone; `KpiTile` as a standalone.

## 1.4 The module/pack system — exists in the database, not yet in the client

This is the answer to "a veterinary practice doesn't get a POD designer": the schema already contains the entire client-bundling system.

| Database object | What it does |
|---|---|
| `platform_modules` | The catalog of every module: 36 agnostic core domains (contacts, deals, pipelines, appointments, bookkeeping, quotes, products, orders, documents, tasks, custom fields, activity, CMS…) plus add-ons (routes, social sync, payroll, time, cap table) and specialty modules (ecommerce storefront, design studio, marketplace + trust & safety, ad center, social platform/UGC, healthcare/HIPAA, financial services, real estate, auto dealer, EdTech). Each row carries `depends_on`, the nav paths it owns, and its backing tables. |
| `platform_tenant_modules` | Which modules a client has switched on. |
| `platform_packs` + `platform_pack_items` | An industry pack = a list of modules plus configuration rows (picklists, record types, custom fields, pipelines, terminology, settings). No pack creates tables. |
| `platform_apply_pack()` | Idempotent; refuses compliance packs (e.g. HIPAA) on a non-certified deployment. |
| `platform_provision_tenant()` | New client = one call: tenant + packs + default pipeline + owner invitation. |
| `platform_tenant_nav()` / `platform_tenant_actions()` | What that specific client sees: nav tree and create-menu actions, permission-filtered. |
| `platform_module_coverage()` | Which modules are backed by real tables. |
| `platform_quick_action_registry` | Every Create action, standard action, and option-menu action in the spec, bound to a canonical RPC, a table, a pure screen, or an outside integration. |
| `platform_feature_tree_coverage` | Every nav path in the spec with its backing table and `is_implemented`. |
| `platform_dashboards`, `platform_dashboard_widgets`, `platform_kpi_targets` | Dashboards and KPI targets — the last nav items that had no backing table. |

**The single biggest wiring gap in the platform:** the client's navigation (`src/data/shellData.ts`, ~2,000 lines) and Create menu are **static**. They should be replaced by calls to `platform_tenant_nav()` and `platform_tenant_actions()` so a client's module set drives the UI — this is what makes scaffolding per client real instead of per-build. When that's wired, a vet practice and a retail store run the same app with different nav and different create menus, straight from the database.

## 1.5 The plan layer (design studio production)

The `plan/` folder is a complete, tested production plan for the design studio: `S590_design_studio_prereq_fixes.sql` (baseline bug fixes), `S600_design_studio_production.sql` (29 tables, 33 RPCs, triggers, RLS, storage buckets — 82/82 security and workflow tests pass), tech-pack templates, the supplier portal, and the sealed-bid RFQ board. It is the most finished vertical in the platform and the pattern to copy for other verticals.

---

# PART 4 — Module by module

Format per module: **What it is → the experience → code today → the database → gaps and what must be built** (the TypeScript types, API routes, and RPCs that need to exist).

---

## MODULE 1 — Contacts & CRM (Parties) — status: LIVE (strongest commerce-side module)

**What it is.** The single home for every person and company — customers, vendors, suppliers, contractors, sellers, leads. One record per human, many roles. Every other module's Party pill resolves here.

**The experience.** Parties list (columns: name, role pills, email, phone, open balance, lifetime value, last activity, segments, owner; tabs by role). The **Party drawer** is the most reused component in the platform: identity, address, finance (terms, currency, tax-exempt, ACH, 1099), role-specific sections, notes and attachments. Party detail opens as a drawer that expands to a page with tabs (Overview, Transactions, Orders, Tickets, Files, Activity). Right-click on any party: role-aware Create menu (invoice, estimate, order, bill, PO, expense, ticket, task, note). Leads live in a pipeline board; appointments in a calendar; segments in a rule builder that feeds marketing audiences.

**Code today.** Components: `ContactsParties.tsx`, `CrmOverviewSupabase.tsx`, `CustomersSupabase.tsx`, `LeadsPipelineSupabase.tsx`, `AppointmentsScreen.tsx`, `PartyFormDrawer.tsx`, `PartyProfile.tsx`, `StatementsScreen.tsx`, `SegmentsScreen.tsx`, `TemplatesScreen.tsx`. Hooks: `useCrmDomain.ts`, `useCrmApi.ts`, `useSegmentsApi.ts`, `useTemplatesApi.ts`. Types: `crmTypes.ts` (1,296 lines). Bridge: `partyMirror.ts` (boots parties into the client store; writes go through the API). API routes: a full `/api/crm/*` family — customers, leads, deals, pipelines + stages, appointments (+ slots, lookups), sequences + steps, segments (+ members), tags, notes, tasks, messages, conversations, campaigns, calls, documents, households, dependents, waitlist, staff, stats, needs-attention.

**The database.** Domain `03_contacts_parties_crm` — 66 tables: `crm_customers`, `crm_households`, `crm_leads`, `crm_deal_stage_history`, `crm_pipelines`, `crm_pipeline_stages`, `crm_appointments` (+ resources, services, availability, booking policies), `crm_segments` + `crm_segment_memberships`, `crm_activity`, `crm_calls`, `crm_sequences`, `crm_automation_workflows`, `crm_documents`, plus `platform_parties` (the unified party spine) and `acct_customers` / `acct_vendors` (finance views of a party).

**Gaps and what must be built**
- **Types:** a canonical `Party` DTO derived from `platform_parties` (today `platformStore.ts` and `partyMirror.ts` hand-map four source tables — `crm_customers`, `acct_vendors`, `suppliers`, `crm_leads` — which is finding 19's "four vendor tables" problem). One party spine type, one role-pill type.
- **APIs/RPCs:** `GET /api/parties/{id}/impact` (for the shared-record banner), `GET /peek/party/{id}` (the peek popover), merge/dedupe endpoints (schema has `support_contacts_merge_guard` as a pattern). Decide the party mapping: `platform_parties` as spine with `crm_*`/`acct_*` as projections.
- **Schema fix:** two segment systems exist (`crm_segments` and `cms_audience_segments`) — pick one canonical, map the other.

---

## MODULE 2 — Sales (Invoices, Estimates, Receipts, Payment links) — status: MIRROR (screens built, seeded data)

**What it is.** Everything that bills a customer and gets you paid: invoices, estimates that convert, sales receipts for instant payment, payment links, customer statements.

**The experience.** Sales overview (get-paid actions bar, funnel from estimate → invoice → paid → deposited, income over time). Invoice = document page: party picker, terms, dates, lines (item/description/qty/rate/amount), deposit charge, notes, attachments, header tabs (Edit, Email view, Payor view, PDF view). Estimate adds expiry + **Convert to invoice**. Payment link = modal → share screen with QR. Record payment = modal from an invoice row. Receive payment and Statements = batch workspaces. Status tabs: Draft, Unpaid, Overdue, Paid, Deposited. Right-click on an invoice: Create-from-this (credit memo, return, ticket, follow-up task, payment link), Communicate (send, remind, email), Money (record payment, refund, mark paid), print/PDF, void last.

**Code today.** Components: `SalesOverview.tsx`, `InvoicesScreen.tsx`, `PaymentLinksScreen.tsx`, `SalesTransactions.tsx`, `ProductsServicesScreen.tsx`, `finance/EstimatesScreen.tsx`, `finance/ReceiptsScreen.tsx`, `statements/Statements.tsx`, `InvoicePdf.tsx`. The document pages render through the shared `DocumentEngine.tsx`. Hooks: `useAccounting.ts` (reads the real `/api/invoices`, `/api/receipts`, `/api/estimates`). Types: `accountingTypes.ts` — `Invoice`, `InvoiceItem`, `Receipt`, `Estimate`, `PaymentTransaction` — verified against the live tables. API routes: `/api/invoices`, `/api/receipts`, `/api/estimates`, `/api/crm/payments`, `/api/crm/payment-links`.

**The database.** Domain `13_finance_sales_receivables` — 39 tables: `acct_ar_invoices` + `acct_ar_invoice_lines`, `acct_estimates`, `acct_ar_receipts` + `acct_ar_receipt_applications` (payments are *receipts* on the AR side), `acct_ar_credit_memos` (credit memos are already backed — the surface is the gap, not the table), `acct_order_payments`, `acct_payment_links`, `acct_recurring_invoices` + lines, `acct_statement_batches` + `acct_customer_statements`. RPCs already written: **`take_payment`**, **`convert_sales_order_to_invoice`**, **`generate_customer_statement`**, **`create_receipt`**, plus the ledger interplay functions (`acct__inv_post_je`, `acct__order_money_in`…).

**Gaps and what must be built**
- **The document-defs API:** `GET /document-defs` (every document type as config) + `POST /documents` + verbs `/send`, `/void`, `/convert`. Today each doc type has its own route and its own screen wiring; the engine component exists but is not config-driven from the server.
- **Types:** `DocumentDef`, `DocumentTotals` (server-computed), `LineDef` per document type — the missing piece of `contracts.ts`.
- **Surfaces:** credit memo (document page), receive-payment workspace, statement batch workspace, recurring drawer (`acct_recurring_invoices` table exists, no UI).
- **APIs:** idempotency keys on `take_payment` (table `platform_idempotency_keys` exists), refund endpoint family.

---

## MODULE 3 — Expenses, Bills & Vendors — status: MIRROR (screens built, seeded data)

**What it is.** Everything you pay: bills, expenses, checks, vendor credits, contractor payments. The automation funnel is Upload & auto-create → For review → Approval → Paid.

**The experience.** Bills list (vendor, bill no, dates, amount, open balance, status, approval, source; tabs For review / Unpaid / Paid; row action changes by status: Review → Approve → Pay). Add bill opens as a drawer that promotes to a full document page, with a capture panel on top (autofill, upload, photo → OCR). Expense = fast drawer. Pay bills = workspace (payment account, date, starting check #, rows with credits and payments, totals). Vendors tab inside Expenses with 1099 flags and ACH-ready pills; Contractors tab with W-9 status and Pay & file 1099s.

**Code today.** Components: `ExpensesBillsOverview.tsx`, `finance/BillsScreen.tsx`, `PayBills.tsx`, `Vendors.tsx`, plus `EXPENSE_DRAWER` in `RecordDrawer.tsx`. Types: `expenses-bills/types.ts`. API routes: `/api/crm/bills` + `/api/crm/bills/[id]` (note: bills currently live under the CRM namespace — see gaps).

**The database.** Domain `14_finance_expenses_payables` — 22 tables: `acct_ap_bills` + `acct_ap_bill_lines`, `acct_spend_transactions` + `acct_spend_lines` (expenses/checks/card credits — one family), `acct_ap_vendor_credits` + lines, `acct_ap_payments` + `acct_ap_payment_applications`, `acct_recurring_bills` (recurring bills *are* backed — the gap was UI only), `acct_receipt_extractions` (the OCR capture panel's storage already exists), `acct_ap_approvals`, `acct_workflows` + instances + actions for approval routing. RPCs already written: **`create_bill`**, **`convert_purchase_order_to_bill`**, `acct_spend_*` trigger family, plus the approval engine the Bills screen's "Approve to Unpaid" needs.

**Gaps and what must be built**
- **The namespace fix:** bills should get their own `/api/bills` (or the document family), with `approve`, `pay`, `match` verbs — not `/api/crm/bills`.
- **CapturePanel (OCR):** the spec's upload-and-autofill component; nothing exists client-side.
- **Upload-multiple-bills workspace** (drop zone → OCR queue → For review).
- **Types:** `BillDef`, `SpendRecord` union (bill/expense/check/vendor credit/card credit), `ApprovalSummary`.
- **Decision from the settings review:** `acct_workflows` (generic) vs `acct_ap_approvals` (bill-specific) — one must be the source of truth (D-1). The approval queue UI and the notification-inbox approve-in-place both depend on it.

---

## MODULE 4 — Purchasing & Inventory — status: PARTIAL (screens built; data flow mixed)

**What it is.** How supply arrives and what you physically hold. Purchase orders (two kinds: replenishment for stock you hold, fulfillment POs auto-created per order for POD/dropship), receiving with three-way match (PO ↔ receipt ↔ bill), and the stock ledger: on hand, reserved, available, per location, with adjustments, transfers, and cycle counts.

**The experience.** PO list (PO #, supplier, dates, status, total, received %, linked orders, bill pill). Create PO = document page with blank/SKU lines. Receive items = modal → workspace for many lines (qty received, damaged, location) that posts stock and offers Create bill. Inventory list (item, SKU, location, on hand, reserved, available, reorder point, incoming PO pill, value, stock status). Right-click: view in catalog, adjust stock, transfer, stock history, start cycle count, create PO, reprice. The **fulfillment type** on every product decides all of this: Stock / POD / Supplier-fulfilled / Digital-Service / Bundle — POD items never show stock pills, they show `Made on demand`.

**Code today.** Components: `finance/PurchaseOrderScreen.tsx`, `orders/PurchaseOrders.tsx`, `orders/InventoryView.tsx`. API routes: `/api/v1/inventory`, `/api/v1/items`. Types: `fulfillment.ts` (routing logic), `supplierKeys.ts`.

**The database.** Domain `09_purchasing_inventory` — 37 tables, and the whole receiving and counting story is already backed: `acct_ap_purchase_orders` + `acct_ap_purchase_order_lines` (the AP view) and `erp_purchase_orders` + lines (the ops view), `erp_goods_receipts` + `erp_goods_receipt_lines` (receiving = the 3-way match), `erp_stock_levels` + `erp_inventory_balances`, `erp_inventory_movements` + `_transactions` (the stock ledger), `erp_inventory_reservations`, `erp_inventory_transfers` + lines, **`erp_inventory_count_sessions` + lines (cycle counts are backed)**, lots/serials/cost layers, `erp_warehouses` + zones + locations, `erp_replenishment_rules` (reorder point, safety stock, lead time, preferred vendor). RPCs already written — this domain is rich: **`create_purchase_order`**, **`erp_send_purchase_order`**, **`erp_receive_purchase_order`**, **`erp_adjust_stock`**, **`erp_transfer_stock`**, **`erp_receive_transfer`**, **`apply_stock_movement`**, **`erp_stock_history`**, **`erp_rebuild_stock_balances`**, `erp_next_document_number`. The `fulfillment_type` column the settings review flagged as missing now exists on `products` (the finance listings route reads it).

**Gaps and what must be built**
- **Screens:** Receive-items workspace, cycle-count workspace, stock history drawer, replenishment/reorder alerts surface — the tables all exist; these are pure client work.
- **APIs:** `POST /purchase-orders/{id}/receive`, `/inventory/adjustments` and `/inventory/transfers` already exist as RPCs — need thin routes over them, plus `GET /inventory/{itemId}/history`.
- **Types:** `PurchaseOrderDef`, `GoodsReceipt`, `StockRecord`, `StockMovement`, `CycleCount`, `ReplenishmentRule`.
- **Wiring:** `erp_replenishment_rules` → reorder alert pills → "Create PO at reorder qty" action.

---

## MODULE 5 — Orders & Fulfillment — status: PARTIAL

**What it is.** The commerce record from every channel (site, Etsy, TikTok Shop, Amazon, POS), its items with design thumbnails, shipping, payment state, and the fulfillment pipeline: needs attention → in production → ready to ship → shipped → delivered. The fulfillment queue and batch slips & labels are workspaces; mark shipped, print label, refund, cancel, and report-a-problem are modals.

**The experience.** Orders list (order #, channel pill, customer pill, date, items, total, payment pill, fulfillment pill, invoice pill, issue alert pill, tracking; needs-attention pinned first). Order detail page with a right rail of pills (customer, invoice, PO, shipment, ticket, return). Bulk: batch slips & labels, mark shipped, push to supplier.

**Code today.** Components: `OrdersOverview.tsx`, `OrdersList.tsx`, `FulfillmentQueue.tsx`, `BatchSlips.tsx`, `ShippingSettings.tsx`, `ReturnsClaims.tsx`. API routes: `POST /api/v1/orders` (creates a real draft `erp_orders` row from a published product, resolving the fulfillment route), `/api/v1/orders/fulfillment`, `/api/v1/orders/[id]/fulfillment-po`.

**The database.** Domain `08_orders_fulfillment` — 39 tables (`erp_orders` + `erp_order_lines`, shipments, packages, tracking events, `shipping_profiles`, `erp_carriers` + `erp_shipping_methods`). RPCs already written: **`erp_mark_shipped`**, **`erp_cancel_order`**, **`erp_record_tracking_event`**, **`unify.create_erp_order`**, `erp_validate_order_line_quantities`, `erp_add_order_note`, `erp_set_carrier_active`, `shipping_apply_tiers`, `sku_weight_lb`.

**Gaps and what must be built**
- **APIs:** `GET /api/v1/orders` (list — only POST exists), `/orders/{id}/labels`, `/orders/{id}/refund`, `/orders/{id}/cancel` (RPC exists; needs route), `POST /orders/batch-labels`.
- **Surfaces:** Refund modal, Cancel-order modal, Report-a-problem modal (creates a ticket), track-shipment peek.
- **Types:** `Order`, `OrderLine`, `FulfillmentStatus`, `Shipment`, `TrackingEvent`.
- **Channel sync:** tracking pushed back to Etsy/Amazon (the `listing_publish` family shows the pattern; outbound sync rules need defining).

---

## MODULE 6 — Returns & Claims (RMA) — status: PARTIAL (screen exists, no API family)

**What it is.** The return lifecycle: request → approve/decline → receive → refund/credit/exchange, with restock on receive and a supplier claim when the defect is theirs.

**Code today.** `ReturnsClaims.tsx` (orders area).

**The database.** Domain `10_returns_claims` — 9 tables, richer than the screen suggests: `customer_return_requests`, `erp_return_authorizations`, `erp_return_lines`, `erp_return_inspections`, `erp_return_refunds`, `commerce_return_actions` + `commerce_return_events` (the timeline), `return_policy_rules`, `order_cases`. The ledger already has `acct__inv_vendor_return` and `acct_refund_inventory_trg` (refunds and restock post correctly), and credit memos are backed by `acct_ar_credit_memos`.

**Gaps:** RMA drawer/page (order picker → lines → reason → resolution → label), approve/decline modal, `POST /returns` + `/returns/{id}/decision` + `/returns/{id}/receive` routes over the existing `erp_return_*` tables, auto-drafted credit memo on approval, and the vendor-credit handoff. **Types:** `ReturnRequest`, `ReturnResolution`.

---

## MODULE 7 — Catalog (Products, Variants, Categories, Channels) — status: PARTIAL

**What it is.** What a thing is and where it's sold: product definition, variants, bundles, blanks, categories, price, cost, margin, and per-channel publish state with sync pills.

**The experience.** Products list (image, name, SKU, type, category, status, channel pills, price, cost, margin, stock/fulfillment pill, supplier pill, design pill). Product drawer with tabs (Basic, Sales, Purchasing, Accounting, Variants, Channels, Design). Right-click: publish/unpublish, reprice, open in Studio, create PO, create discount/banner/post/campaign. Category creation is inline inside the product form so the category prerequisite never blocks entry. Channel cards with sync status.

**Code today.** Components: `catalog/CatalogProductsScreen.tsx`, `ProductFormDrawer.tsx`, `ProductProfile.tsx`, plus the design-side catalog screens (`design/ErpProductCatalogScreen.tsx`, `ErpProductPageScreen.tsx`, `MyProductsTable.tsx`, `ReviewGrid.tsx`). API routes: `/api/products`, `/api/products/[id]`, `/api/products/[id]/variants`, `/api/variants/[id]`, `/api/v1/items`, `/api/v1/categories`, `/api/v1/collections`, `/api/v1/finance/listings` (the published-listing view joining `products` → `product_variants` → `design_publications`).

**The database.** Domain `05_catalog_products` — 58 tables (`products` with `fulfillment_type`, `income_account_id`, `cogs_account_id`; `product_variants`; `categories` + taxonomy trees; `commerce_price_lists` + `commerce_prices`). RPCs already written: **`listing_publish`**, **`listing_unmap`**, `listing_map_category`, `set_product_attribute`, `register_product_attributes`, `recompute_category_counts`, `catalog_upsert_source_category`, `product_has_live_brand`.

**Gaps and what must be built**
- **Channels sync surface:** channel cards with connect/mapping/rules drawers (tables exist in domain `07_storefront_checkout_channels` — 78 tables, the largest domain).
- **Category consolidation decision:** multiple category structures exist (`categories`, `taxonomy_nodes`, `commerce_categories`, `erp_product_categories`) — pick canonical, map the rest.
- **Pricing decision:** three discount systems (`commerce_promotions`/`commerce_coupons`, `crm_pricing_rules`, `cms_offers`) — choose one.
- **Types:** `CatalogItem`, `Variant`, `ChannelListing`, `PublishState`.

---

## MODULE 8 — Design Studio & Print-on-Demand — status: LIVE (deepest vertical)

**What it is.** The canvas where designs are made, priced against blanks, published as products, and fulfilled through suppliers. Blanks are ingested from Printful/Printify, designs render through a worker pipeline, and published designs become catalog products with real margins.

**The experience.** Studio layout: left rail (upload, AI, text, graphics, images, library, templates), canvas with print-area guides, right panel (layers, properties, blank colorways), top bar (preview, view product page, save, publish), live cost/price/margin. Design list (New design, Collection, Published, My templates). Publish flow: choose blank + variants → price (margin from supplier cost) → channels + category → product records created. The `plan/` layer extends this to a production studio: tech packs, sealed supplier RFQs, and a supplier portal where design masters never leak.

**Code today.** Components: `design/DesignCanvasScreen.tsx`, `CreateWizard.tsx`, `DesignCategoryTable.tsx`, `DesignPreviewScreen.tsx`, `ProductPageScreen.tsx` + `ProductPageModal.tsx`, `MyProductsTable.tsx`, `ReviewGrid.tsx`, `ProductCard.tsx`. Stores/libs: `designCanvasStore.ts` (1,273 lines), `podApi.ts` (1,069), `podServer.ts`, `printful.ts`, `printify.ts`, `blankIngest.ts`, `renderCore.ts`, `renderWorker.ts`, `fulfillment.ts`. API routes: `/api/v1/blanks` (+ approve-render, hide, ingest, orders, price, skeleton, test-render, views, workspace), `/api/v1/designs` (+ preview, price, print, publish), `/api/v1/design-queue`, `/api/v1/renders` + retry, `/api/v1/render-worker/claim` + `run`, `/api/v1/inspiration`, `/api/v1/rankings`, `/api/v1/ai/generate`, `/api/v1/files`, `/api/v1/stores`, `/api/v1/settings`, `/api/v1/ingest/status`. Studio surfaces: `StudioDrawer.tsx`, `PeekDrawer.tsx`.

**The database.** Domain `06_design_studio` (9 tables) plus the production layer in `plan/db/S600_design_studio_production.sql`: **29 tables, 33 RPCs, RLS, storage buckets — 82/82 security tests pass** (design files, versions, tech packs, RFQs, supplier bids, render jobs).

**Gaps and what must be built**
- **The publish loop to sales channels** (Studio → Catalog → Channels) — the `listing_publish` RPC is the bridge; needs the channel-config drawers.
- **Collection canvas** (Studio-style builder).
- **Social library pull** (mockups into Marketing).
- **Types:** formalize `Design`, `DesignVersion`, `Blank`, `RenderJob`, `TechPack` in one `designTypes.ts` (currently spread across `designCanvasStore` and `podApi`).

---

## MODULE 9 — Finance & Accounting (Banking, Reconcile, Chart of Accounts) — status: PARTIAL

**What it is.** The books: bank transactions for review, rules that auto-categorize, reconciliation, the chart of accounts, journal entries, deposits, transfers, and the settlement workspace that splits a Stripe/Shopify payout into gross, fees, refunds, disputes, and net. Also the financial-account side of Banking & Cards (Treasury-style accounts and issued cards).

**The experience.** Bank transactions: date, description, payee pill, category, amount, status (For review / Matched / Categorized / Excluded), match pill; row actions Match / Categorize / Create-from. Reconcile: setup modal (statement ending balance + date) → two-column workspace with a live difference meter. Chart of accounts: code, name, type, subtype, normal balance, parent tree, flags (System, Control, Reconcilable, No posting), balance; register view per account.

**Code today.** Components: `AccountingOverviewScreen.tsx`, `BankTransactionsScreen.tsx`, `BankRulesScreen.tsx`, `CashFlowScreen.tsx`, `ChartOfAccountsScreen.tsx`, `ReconcileScreen.tsx`. Types: `accountingTypes.ts`. Data: `chartOfAccounts.ts`. API routes: none dedicated yet beyond the CRM-family document routes.

**The database.** Domains `11_finance_ledger` (57 tables, **240 functions** — posting, JE, close, consolidation, KPI), `12_finance_banking_treasury` (32 tables, incl. Teller bank-sync RPCs: `teller_ingest_transactions`, `teller_process_webhook`, `teller_record_balance`…). RPCs already written: **`acct_bank_match_candidates`**, **`acct_bank_rule_matches`**, **`acct_reconciliation_mark`**, **`acct_reconciliation_summary`**, `acct__ensure_account`, `acct__ledger_sums`, plus the posting engine (`acct_post_journal` family) and period/fiscal-year machinery. Settlements and payouts are backed too: `acct_channel_settlements` + `acct_channel_settlement_lines`, `acct_payouts`, `acct_bank_deposits` + lines, `acct_order_postings`, and `acct_bank_statements` for reconcile setup.

**Gaps and what must be built**
- **Bank rules:** the screen exists and `acct_bank_rules` + `acct_bank_rule_matches` are now in the schema — what's missing is the rules CRUD route and the "create rule from this transaction" flow.
- **APIs:** `GET /bank-transactions`, `/match`, `/categorize`, `/create-from`; `POST /reconciliations` + `/finish`; journal-entry CRUD; `POST /transfers`; deposit (combine funds) workspace; **settlement workspace** over `acct_channel_settlements` + `acct_channel_settlement_lines` + `acct_payouts`.
- **Types:** `BankTransaction`, `MatchCandidate`, `Reconciliation`, `JournalEntry`, `SettlementSplit`.
- **Schema decision from the settings review (D-2):** confirm allowed `account_type` values (`income` vs `revenue`; COGS as subtype, not type) before the CoA drawer ships.
---

## MODULE 10 — Business Tax (Income, Sales, Payroll, 1099s) — status: PARTIAL (screens exist, engine wiring open)

**What it is.** The tax cockpit: taxable profit estimate, deductible expenses with source counts, 1099-K detail, payroll tax, year-end filing, and the sales-tax liability view (rates by jurisdiction, filing periods, pay-sales-tax workspace like Pay bills).

**Code today.** Components: `business-tax/BusinessTaxOverview.tsx`, `TaxSummary.tsx`, `YearEndFiling.tsx`, `types.ts`.

**The database.** Domain `18_business_tax_e_file` — 51 tables (`acct_tax_filings` with period, taxable sales, collected, remitted, status, confirmation ref; `acct_1099_thresholds`; `seller_1099k_generations`; `acct_payroll_tax_forms`; the `mef_*` e-file tables). Domain `17_sales_tax` — 18 tables (`acct_tax_jurisdictions`, `acct_tax_codes` with rates and payable/receivable accounts, `seller_tax_exemptions`). 

**Gaps and what must be built**
- **The sales-tax engine decision (the known build blocker):** make `acct_tax_codes` + `acct_tax_jurisdictions` canonical; retire or map the older `acct_tax_rules`/`acct_tax_rates`/`taxes` tables. Add the per-item tax category and per-customer exemption (the two missing fields from the settings review), wire per-line calculation into the Document Engine's totals block, and flag marketplace-collected tax as excluded from liability.
- **Surfaces:** Pay sales tax workspace, nexus alert pills, deductible-expense drill (source count pill → filtered transactions).
- **APIs:** `GET /tax/summary`, `/tax/filings`, `POST /tax/filings/{id}/pay`.
- **Types:** `TaxSummary`, `Jurisdiction`, `TaxFiling`, `DeductionCategory`.

---

## MODULE 11 — Marketing, Social, Ads & CMS — status: PARTIAL (14 screens built; several read static data)

**What it is.** Promotion on every surface: banners and popups with live preview, discount codes and promotions, the social publishing calendar and library, newsletter campaigns, automation flows (triggers from other modules: order placed, invoice overdue, ticket closed, low stock), the Ad Center (campaigns, ad sets, creatives, audiences, pixels, ad spend that posts to Expenses automatically), and the CMS (pages, blocks, navigation).

**Code today.** Components: `marketing/` — `PublishingOverviewScreen`, `CreateContentScreen`, `OversightScreen`, `PromotionsScreen`, `NewsletterScreen`, `AutomationScreen`, `AdCenterScreen`, `CampaignsScreen`, `AdSetsScreen`, `CreativesScreen`, `AudiencesScreen`, `PixelsScreen`, `AdSpendScreen`, `AdvertisersScreen`. API routes: `/api/crm/campaigns`, `/api/crm/sequences`, `/api/crm/templates`.

**The database.** Domain `21_marketing_social_email_promotions` — 31 tables (`crm_campaigns` + members, `crm_sequences` + steps, `newsletter` + subscribers, `marketing_suppressions`, `social_accounts`/`social_posts`/`social_schedule_slots`/`social_post_series`). Domain `22_advertising` — 37 tables (`ad_campaigns`, `ad_creatives`, `ad_placements`, `ad_events`, `ad_audiences`, `ad_accounts`, `ad_budget_tiers`…). Domain `20_website_cms` — 49 tables (`cms_pages` + `cms_page_revisions`, `cms_content_blocks` + `cms_block_schemas`, `cms_banners`, **`cms_popups` now exists**, `cms_slots` + `cms_slot_items`, `cms_navigation_menus`, `cms_seo`, `cms_locales`).

**Gaps and what must be built**
- **The pricing decision:** three overlapping discount systems (`commerce_promotions`/`commerce_coupons`, `crm_pricing_rules`, `cms_offers` + `cms_volume_tiers` + `cms_bundle_rules`) — choose one canonical family; the Promotions drawer targets it.
- **Surfaces:** banner/popup drawers with live preview (tables now exist), social calendar/queue/library screens wired to `social_*`, newsletter builder (audience → content blocks → review → send), the flow builder for automation.
- **APIs:** `/discounts`, `/banners`, `/popups`, `/posts` + `/schedule`, `/campaigns` (ad) with spend→expense posting.
- **Types:** `Promotion`, `BannerDef`, `PopupDef`, `SocialPost`, `AdCampaign`, `AutomationFlow`.

---

## MODULE 12 — Support (Inbox, Tickets, SLA) — status: PARTIAL (queue screens built; ticket CRUD API open)

**What it is.** The cross-module resolution layer: an omnichannel inbox (email, chat, social DMs, marketplace messages, order "report a problem," POS receipt lookup, banking complaints) where the agent fixes the issue *from the ticket* — refund, track shipment, record payment, approve an RMA — without leaving the conversation. Queues: Customer, Seller, Attention (SLA at risk), Disputes & Complaints.

**The experience.** Three panes: list (ticket #, subject, requester pill, type, channel, priority, status, assignee, SLA timer pill, related pills), conversation (single timeline with internal notes, system events, macros, AI draft with KB suggestions), context sidebar (customer card with LTV and balance, recent orders with inline actions, open invoices, RMAs, design proof, shipment tracking, previous tickets).

**Code today.** Components: `support/SupportOverviewScreen.tsx`, `SupportTicketsScreen.tsx`, `SupportWorkspaceScreen.tsx`; `queue/AttentionQueueScreen.tsx`, `ConversationInbox.tsx`, `CustomerQueueScreen.tsx`; `TICKET_DRAWER` in `RecordDrawer.tsx`. API routes: `/api/v1/support/overview`, `/api/v1/support/tickets/[id]/proof`, `/api/queue/counts`.

**The database.** Domain `23_support_trust_safety` — 58 tables, deep: `support_tickets` (immutable `support_ticket_events`), `support_ticket_participants`, `support_ticket_relations` (the related-record pills), `support_queues`, `support_sla_policies` (first response / next reply / resolution minutes, business hours), `support_routing_rules` + `support_escalation_rules` + `support_automations`, `support_macros`, `support_channels` + `support_channel_threads`, `support_forms`, `support_kb_articles`, `support_oncall_schedules`, outbound webhooks. RPCs already written: `support_tickets_assign_ref`, `support_next_ticket_ref`, `support_messages_rollup`, `support_grant_access`, merge guards.

**Gaps and what must be built**
- **APIs:** the full ticket family — `GET/POST /tickets`, `/tickets/{id}` + `/messages`, `/assign`, `/merge`, `/status`, `/macro` — the tables and RPCs are waiting.
- **Surfaces:** the three-pane workspace wiring, SLA timer pills, KB article suggestions in the composer, "create article from ticket."
- **Self-service portal:** order status, tracking, self-serve returns (creates an RMA), gift card balance.
- **Types:** `Ticket`, `TicketEvent`, `SlaPolicy`, `Macro`, `SupportContextCard`.

---

## MODULE 13 — Marketplace & Sellers — status: LIVE (screens and API built)

**What it is.** The marketplace operator's view: seller list, seller detail (overview, catalog, orders, payouts, compliance & 1099, support), the seller feed, the onboarding queue with approve/decline, and trust & safety (violations, investigations, appeals, policy enforcement).

**Code today.** Components: `sellers/SellersScreen.tsx`, `SellerDetailScreen.tsx`, `SellerFeedScreen.tsx`, `SellerOnboardingScreen.tsx`, `SellerQueueScreen.tsx`; `sellerStore.ts`; `useSellersApi.ts`. API routes: `/api/sellers`, `/api/sellers/[id]`, `/api/sellers/appeals` (+ `[id]`), `/api/sellers/feed`, `/api/sellers/violations/[id]`.

**The database.** Domain `04_marketplace_sellers` — 38 tables: `sellers`, `seller_settlements` + `seller_settlement_reversals`, `seller_stripe_accounts` (Connect), `seller_violations`, `seller_investigations`, `seller_appeals`, `seller_policy_enforcement`, `trust_policies`, `seller_1099k_generations`.

**Gaps and what must be built**
- **Payout surfaces:** the settlements workspace over `seller_settlements` (approve/hold/reverse, 1099-K generation view).
- **Types:** formalize `Seller`, `SellerSettlement`, `Violation` (currently inside `sellerStore.ts`).

---

## MODULE 14 — People (Team, Contractors, Payroll, Time) — status: PARTIAL (tasks/staff built; payroll and time have tables but no UI)

**What it is.** Everyone who works: teammates and roles, contractors with W-9 invites and 1099 filing, employees with pay schedules, payroll runs, and time entry that flows into invoices (billable) and payroll (approved hours).

**Code today.** Components: `TasksProjectsScreen.tsx`; `useCrmApi` family covers tasks/staff/templates. API routes: `/api/crm/tasks`, `/api/crm/staff`, `/api/crm/templates`.

**The database.** Domain `16_team_payroll_contractors_time` — 33 tables: `acct_employees`, `acct_payroll_employees`, `acct_payroll_runs` + `acct_payroll_run_items` + `acct_payroll_deductions`, `acct_payroll_tax_forms`, `payroll_timesheets`, `acct_time_entries`, `crm_staff_shifts` + `crm_shift_templates`. Roles/permissions: `tenant_memberships`, `platform_module_permissions`, `platform_form_field_visibility` (domain 01/02).

**Gaps and what must be built**
- **Surfaces:** run-payroll workspace (period → hours from time → review → approve → pay), time entry grid (person, date, hours, related record, billable toggle), W-9 invite flow on the contractor Party drawer, "Pay and file 1099s" workspace.
- **Decision (still open):** build vs integrate payroll — the tables and ledger posting exist, so a provider integration behind the same screens is the cheaper path.
- **Types:** `Employee`, `PayRun`, `TimeEntry`, `ContractorProfile`.

---

## MODULE 15 — Cap Table & Valuation — status: LIVE (most complete module in the platform)

**What it is.** Ownership: stakeholders, funding rounds, option pool, SAFEs and convertibles, equity events (grants, exercises, transfers), dilution modeler, liquidation waterfall, 409A valuations, and documents with e-sign.

**Code today.** Components: `cap-table/CapTableScreens.tsx` (module CSS). Engines: `equityStore.ts` (2,502 lines), `equityEngine.ts`, `valuation409aEngine.ts`, `equityTypes.ts`. API routes: the full families — `/api/cap/companies`, `/cap/stakeholders`, `/cap/classes`, `/cap/securities/issue`, `/cap/grants`, `/cap/plans`, `/cap/approvals`, `/cap/snapshots`, `/cap/transactions/[action]`, `/cap/table`, `/cap/schema`; `/api/val/requests` (+ `/{id}/[step]`), `/api/val/active-fmv`, `/api/val/material-events`, `/api/val/reports/[id]/adopt`; `/api/equity/state`.

**The database.** Domain `19_cap_table_valuation` — 24 tables, 38 functions (`cap_share_classes`, `cap_equity_events`, rounds, SAFEs, waterfall tables).

**Gaps:** mostly polish — surface the funding-round → bank deposit link, the equity-event → journal-entry link, and the documents → shared Files library link that the spec calls for. This module is the template for what "done" looks like.

---

## MODULE 16 — Dashboard, Reports & Analytics — status: PARTIAL

**What it is.** Tiles that drill (GMV, orders, products, support, analytics — each a number + sparkline + delta + click-into-filtered-list), pinned Tasks/Calendar, favorites, inbox/notifications, and the report pages with date-range compare, group-by, saved views, and row-click drill-down to the underlying list.

**Code today.** Components: `dashboard/DashboardScreens.tsx`, `OverviewViews.tsx`, `AnalyticsViews.tsx`, `QueueViews.tsx`, `DashboardModals.tsx`, `dashboardController.ts`. API routes: `/api/queue/counts`, `/api/v1/reports/designs`, `/api/v1/rankings`.

**The database.** `platform_dashboards` + `platform_dashboard_widgets` + `platform_kpi_targets` (added in S400 — the last nav items without backing), `platform_report_definitions`, `analytics_events`, `analytics_export_runs`, the `google_ga4_*` family.

**Gaps and what must be built**
- **APIs:** `GET /dashboard/tiles` (tile values with their drill queries), the generic `GET /reports/{key}` with `drill` in each row, save-view/schedule/export.
- **The drill-down rule:** every tile and report row must open the pre-filtered list — this is the integration contract for this module.
- **Missing tables (from the settings review):** saved report templates and scheduled reports — small additions.
- **Types:** `KpiTile`, `ReportDef`, `ReportRow` (with `drill`).

---

## MODULE 17 — Settings & the Module System — status: PARTIAL (one screen; the system exists in the database)

**What it is.** Workspace settings: general, teammates and roles, module access, approvals and limits, chart of accounts, bank rules, recurring templates, tax, fulfillment and shipping, office hours, brands, security, activity log, integrations, notifications, API tokens, data & privacy (import/export/backups), feature flags, custom fields.

**Code today.** Components: `settings/WorkspaceSettings.tsx`, `data/settingsAccess.ts`, `data/chartOfAccounts.ts`. API routes: `/api/v1/settings`.

**The database.** Everything listed in the settings spec is backed or documented as a decision: `tenants` + `tenant_locations`, `tenant_memberships` + `platform_module_permissions` + `platform_form_field_visibility`, `acct_workflows` + `acct_ap_approvals` (the approval engine), `acct_chart_of_accounts` (+ `acct_bank_accounts`), `acct_bank_rules`, `acct_recurring_invoices`/`acct_recurring_bills`/`acct_recurring_journals`, `acct_tax_*`, `erp_carriers` + `erp_shipping_methods`, `support_business_hours` (four overlapping hours tables — decision D-5), `brands` + `brand_profiles`, `user_workspace_sessions`, the five audit tables, `integration_keys` + `integration_secrets` + `platform_integration_health_registry`, `user_notifications`, `api_keys`, `platform_backups`, `platform_feature_flags`, `platform_custom_fields`, `acct_import_jobs` (import hub), `acct_fiscal_years` + `acct_periods` (period lock).

**Gaps and what must be built**
- **The wiring gap of the whole platform:** replace static `shellData.ts` nav with `platform_tenant_nav()` and the static CreateFlyout with `platform_tenant_actions()` + `platform_quick_action_registry`. This single change is what makes the platform one product that re-shapes per client.
- **The settings screens themselves** — the pattern is set (section page → card per setting → inline edit or drawer); build them per the settings spec's page-by-page list, resolving decisions D-1 through D-6 on the way.
- **Import hub:** one central importer (QuickBooks, CSV, marketplace) with field mapping, dry-run, and undo — `acct_import_jobs` is ready.

---

## MODULE 18 — POS & Gift Cards — status: tables exist, screens not built

**What it is.** A store sale is a normal order with a store channel pill. POS is a full-screen touch surface: product grid, barcode scan, cart, optional customer attach, tender (card, cash, gift card, split), shift open/close with count sheet and Z report, manager override PIN. Gift cards are a liability ledger: issue, redeem (partial, split tender), reload, adjust, refund-to-card; store credit rides the same ledger.

**The database.** `commerce_register_sessions` (shifts), `commerce_gift_cards` (+ `acct_gift_card_check` RPC), `acct_ar_receipts` (tender-level settlement), locations in `tenant_locations`/`crm_locations`. Z-report posting rides the ledger's journal engine.

**Gaps:** the POS app surface (the single biggest missing client build), gift-card drawer/modals, and the liability account wiring. **Types:** `RegisterSession`, `Tender`, `GiftCard`, `GiftCardLedgerEntry`.

---

## MODULE 19 — Community / UGC (future) — status: schema only

`24_community_reviews_ugc` — 10 tables (`ugc_posts`, `ugc_comments`, `ugc_reactions`, `ugc_reports` + trust & safety). Belongs to the social-platform specialty module; no screens. Not in any near-term pack.

---

# PART 5 — The consolidated gap register (what to build, in one list)

## A. The five wiring gaps that change everything

1. **Seed-data screens → live screens.** The finance document screens (invoices, bills, estimates, receipts, POs, orders, inventory, returns, COA, vendors) read `platformStore` seed rows. Follow the `partyMirror` pattern (or a proper query-cache layer keyed `[entity, id]`): reads from the API, writes through RPCs. This is the difference between a demo and a product.
2. **Static nav → tenant nav.** `shellData.ts` (~2,000 lines) and `CreateFlyout` must be driven by `platform_tenant_nav()` / `platform_tenant_actions()` / `platform_quick_action_registry`. This is what makes the vet-practice vs retail-store packaging real.
3. **Local surface state → the surface store.** Only `SurfaceHost` uses `useSurfaces`; every screen's open/close must route through it so the envelope, dirty guard, depth-2 stack, and return-to actually work everywhere.
4. **Per-type routes → the Document Engine API.** `GET /document-defs`, `POST /documents`, and the verbs (`/send`, `/void`, `/convert`, `/approve`, `/pay`, `/receive`). The client engine component exists; it needs server config. This collapses the invoice/bill/estimate/PO/credit-memo/sales-order surface work into one build.
5. **Cross-cutting endpoints.** None of the platform-glue endpoints exist yet: `GET /search`, `/create-menu`, `/peek/{type}/{id}`, `/{type}/{id}/activity`, `/{type}/{id}/impact`, `/preview-change`, `/push`, `POST /bulk/{type}`, `/nav-counts`, `/dashboard/tiles`. Each is small; together they are the integrated feel — pills that peek, right-rails that show related + activity, bulk bars, impact banners, the scoped→global push.

## B. Missing components (from the spec's registry)

`TaskDrawer`, `DiscountDrawer`, `BannerDrawer`, `PopupDrawer`, `CollectionDrawer`, `RecurringDrawer` (DrawerDef configs); `CapturePanel` (OCR — storage `acct_receipt_extractions` exists); `ExistingRecordBanner` (the shared-record warning, with `/impact`); `KpiTile` standalone; `AttachmentStrip` standalone.

## C. Open decisions (from the settings review, still standing)

- **D-1:** `acct_workflows` (generic) vs `acct_ap_approvals` (bill/PO) — one source of truth for approvals.
- **D-2:** account type values (`income` vs `revenue`; COGS as subtype) — blocks the CoA drawer.
- **D-3:** what `is_control_account` blocks (manual journal posting is the usual meaning).
- **D-4:** external access = portal users (customers/sellers) — confirm.
- **D-5:** four overlapping hours tables → one canonical source for SLA.
- **D-6:** make `acct_tax_codes` + `acct_tax_jurisdictions` canonical; retire `acct_tax_rules`/`acct_tax_rates`/`taxes`.
- Plus: party consolidation (four vendor tables → `platform_parties` spine), category consolidation (four category structures), pricing consolidation (three discount systems), payroll build-vs-integrate, blanks as held inventory (production/BOM step), scoped-Orders question, and period-lock enforcement in `acct_post_journal`.

## D. The RPCs that exist and only need routes

This is the cheap wins list — server logic already written, waiting for an HTTP surface and a button: `take_payment`, `create_receipt`, `generate_customer_statement`, `convert_sales_order_to_invoice`, `create_bill`, `convert_purchase_order_to_bill`, `create_purchase_order`, `create_sales_order`, `erp_send_purchase_order`, `erp_receive_purchase_order`, `erp_adjust_stock`, `erp_transfer_stock`, `erp_receive_transfer`, `erp_stock_history`, `erp_mark_shipped`, `erp_cancel_order`, `erp_record_tracking_event`, `acct_bank_match_candidates`, `acct_reconciliation_mark`/`summary`, `listing_publish`, `platform_tenant_nav`, `platform_tenant_actions`, `platform_apply_pack`, `platform_provision_tenant`.

---

# PART 6 — Client packaging (how scaffolding actually works)

The database already contains the duplicable system; this is how to use it.

**The catalog.** `platform_modules` holds every module as core (every client), add-on (agnostic but optional), or specialty (industry). Dependencies are declared (`design_studio` depends on `ecommerce`; `marketplace` depends on `ecommerce`; `payroll` depends on `bookkeeping`), so a pack can never ship something broken.

**The pack.** `platform_packs` + `platform_pack_items` = a business type as a list of modules plus configuration rows (picklist values, record types, custom fields, pipelines, terminology, settings). No pack creates tables. `platform_apply_pack()` is idempotent and refuses compliance packs (HIPAA) on non-certified deployments.

**Provisioning.** `platform_provision_tenant()` = one call: tenant + packs + default pipeline + owner invitation. Then `platform_tenant_nav()` and `platform_tenant_actions()` tell the client exactly what to render. `platform_module_coverage()` reports which modules are backed by real tables.

**Example packs (what the schema's catalog implies):**

| Client type | Core set | Add-ons / specialty | What they never see |
|---|---|---|---|
| **Veterinary practice** | contacts, deals, pipelines, appointments, reminders, tasks, documents, tracked records (patients), activity, bookkeeping, quotes, support, reporting | time, payroll | design studio, POD, marketplace, cap table, ad center |
| **Retail store** | products, orders, inventory, bookkeeping, support, cms | POS (register sessions), gift cards | design studio, cap table, marketplace |
| **Print-on-demand brand** | products, orders, bookkeeping, cms | design studio (blanks, renders, publish), social sync, ad center | POS registers, cap table |
| **Marketplace operator** | products, orders, bookkeeping, support, sales tax | marketplace + trust & safety, ad center, gift cards | design studio (unless in-house) |
| **Service business** | contacts, deals, pipelines, appointments, quotes, bookkeeping, tasks | time (billable), payroll | catalog depth, POD, marketplace |
| **Startup with equity** | the standard commerce/finance set | cap table + valuation | — |

**The scaffolding rule:** a client's build = apply pack(s) + resolve open decisions that touch their modules + build the module surfaces they're missing from the gap register. Nothing new per client except configuration.

---

# PART 7 — Where we are and where to go

## The honest status

- **Built and live:** shell + tab system, surface store, universal components (TableShell, RecordDrawer with six configs, pickers, modals, DocumentEngine, pills/peek), the CRM family (fullest API), cap table and valuation, sellers/marketplace, design studio and POD pipeline (including the tested production plan).
- **Built but on seed data:** the finance document screens — invoices, bills, estimates, receipts, POs, orders, inventory, returns, COA, vendors.
- **Screens without APIs:** business tax, marketing (14 screens), support queues, settings, dashboard.
- **Database without screens:** payroll, time, POS, gift cards, community/UGC, the import hub, bank rules CRUD.
- **The modular system:** fully specified in the database, not yet consumed by the client.

## The build order (revised against reality)

1. **The Document Engine API** (`/document-defs`, `/documents`, verbs) — it collapses the most screen work into one build and unblocks invoices, bills, POs, estimates, credit memos, sales orders.
2. **The seed→live migration** for the finance screens, using the existing RPCs (the cheap-wins list above).
3. **The tenant wiring** — `platform_tenant_nav()` / `platform_tenant_actions()` replacing static nav and the Create menu. After this, packaging clients is configuration.
4. **The glue endpoints** — `/search`, `/peek`, `/activity`, `/impact`, `/bulk`, `/nav-counts`, `/dashboard/tiles`. The integrated feel ships here.
5. **Support ticket API + context sidebar** (the tables are the richest in the platform relative to its UI).
6. **Returns/RMA surfaces** (all backed), **receive-items + cycle-count workspaces** (all backed), **settlement workspace** (all backed).
7. **Sales tax engine** (decision D-6 first — it's the named build blocker).
8. **Marketing wiring, gift cards, POS, payroll decision.**

## The definition of done, per screen (the shipping checklist)

- Every party/item/account/order mention renders as a pill that peeks and opens.
- Right-click follows the eight-section grammar with Create-from-this.
- The right rail shows Related + Activity.
- Create-from-this-screen prefills from the envelope and returns to the exact place.
- An alert pill exists for every state that needs a human.
- Reports and tiles drill into the exact filtered list.
- The surface is the right size (peek → modal → drawer → page → workspace → studio).
- Permissions are respected in menus, fields, and pills.
- Scoped views search global first, dedupe on push, and show Local/Pushed/Live state.
- The screen reads live data, not seeds.
