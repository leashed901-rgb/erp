# Chart of Accounts & Ledger
**Status:** PARTIAL

## What it is
The ledger spine: accounts (code, type, subtype, normal balance, parent tree, flags: System, Control, Reconcilable, No posting), journal entries with balance check, period locks, fiscal years, budgets, dimensions, fixed assets, debt instruments, month-end close tasks.

## The experience
- **CoA list** — Code · Name · Type · Subtype · Normal balance · Parent (tree) · Currency · Flag pills · Active · Balance (derived from journal lines). Sorts: type order, name, balance. Entity switcher filters (multi-entity).
- **New account drawer** — entity, code, name, type, subtype, parent, description, currency, posting/reconcilable/control flags, dimension rules.
- **Register view** (click an account) — Date · Type · Num · Payee · Memo · Debit · Credit · Balance.
- **Journal entry** — document page: date, journal no., lines (Account picker, debit, credit, description, name, tag), balance check bar, attachments, reverse/auto-reverse.
- **Registry:** `create.account`, `create.journal_entry` (`acct_post_entry`), `journal.post_draft`, `journal.reverse`.

## Code today
- **Components:** `finance/ChartOfAccountsScreen.tsx`, `ACCOUNT_DRAWER` in `RecordDrawer.tsx`, `data/chartOfAccounts.ts`
- **API routes:** none built yet for this module.

## Registered actions
| Action code | Display name | Kind | Bound to | Access |
| --- | --- | --- | --- | --- |
| `create.invoice` | Invoice | create | acct_ar_invoices (table) | member |
| `create.payment_link` | Payment link | create | acct_create_payment_link (RPC) | member |
| `create.receive_payment` | Receive payment | create | acct_record_receipt (RPC) | member |
| `create.statement` | Statement | create | acct_create_statement_batch (RPC) | member |
| `create.estimate` | Estimate | create | acct_estimates (table) | member |
| `create.sales_receipt` | Sales receipt (document_kind = sales_receipt) | create | acct_ar_invoices (table) | member |
| `create.credit_memo` | Credit memo | create | acct_create_credit_memo (RPC) | member |
| `create.expense` | Expense (txn_kind = expense) | create | acct_spend_transactions (table) | member |
| `create.check` | Check (txn_kind = check) | create | acct_spend_transactions (table) | member |
| `create.bill` | Bill | create | acct_ap_bills (table) | member |
| `create.pay_bills` | Pay bills | create | acct_pay_bills (RPC) | member |
| `create.vendor_credit` | Vendor credit | create | acct_ap_vendor_credits (table) | member |
| `create.contractor` | Add contractor | create | acct_invite_contractor (RPC) | member |
| `create.bank_deposit` | Bank deposit | create | acct_make_deposit (RPC) | member |
| `create.journal_entry` | Journal entry | create | acct_post_entry (RPC) | member |
| `journal.post_draft` | Post draft journal | option | acct_post_draft_journal (RPC) | member |
| `journal.reverse` | Reverse journal | option | acct_reverse_journal (RPC) | member |
| `create.transfer` | Transfer | create | acct_transfer_funds (RPC) | member |
| `create.reconcile` | Reconcile | create | acct_start_reconciliation (RPC) | member |
| `create.settlement` | Settlement | create | acct_channel_settlements (table) | member |
| `create.product_service` | Add product/service | create | acct_items (table) | member |
| `create.account` | Add account | create | acct_chart_of_accounts (table) | admin |
| `create.void` | Void | create | app_void (RPC) | member |
| `po.create_bill` | Create bill from PO | option | acct_bill_from_purchase_order (RPC) | member |
| `bill.view` | View bill details | option | /finance/bills/:id (ui) | member |
| `bill.approve` | Approve to Unpaid | option | acct_decide_bill (RPC) | member |
| `bill.submit` | Submit for approval | option | acct_submit_bill (RPC) | member |
| `bill.post` | Post bill | option | acct_post_bill (RPC) | member |
| `bill.download_attachment` | Download attachment | option | /finance/bills/:id/attachment (ui) | member |
| `bill.delete` | Delete bill | option | app_delete_draft (RPC) | member |
| `bill.categorize` | Categorize | option | acct_mark_bill_reviewed (RPC) | member |
| `bill.match` | Match to PO | option | acct_po_match (RPC) | member |
| `bill.schedule_payment` | Schedule payment | option | acct_schedule_bill_payment (RPC) | member |
| `bill.from_inbox` | Create bill from inbox | option | acct_inbox_create_bill (RPC) | member |
| `invoice.send` | Send | option | acct_send_invoice (RPC) | member |
| `invoice.remind` | Remind | option | acct_send_invoice (RPC) | member |
| `invoice.mark_paid` | Mark paid | option | acct_mark_invoice_paid (RPC) | member |
| `invoice.post` | Post invoice | option | acct_post_invoice (RPC) | member |
| `invoice.match` | Match | option | acct_match_bank_transaction (RPC) | member |
| `invoice.void` | Void invoice | option | acct_void_invoice (RPC) | member |
| `estimate.convert` | Convert to invoice | option | acct_convert_estimate (RPC) | member |
| `statement.open` | Open | option | /finance/statements/:id (ui) | member |
| `statement.duplicate_next` | Duplicate for next period | option | acct_duplicate_statement_batch (RPC) | member |
| `statement.generate` | Generate statements | option | acct_generate_statement_batch (RPC) | member |
| `statement.send` | Send | option | acct_send_statement (RPC) | member |
| `statement.send_reminder` | Send reminder | option | acct_send_statement (RPC) | member |
| `statement.print` | Print/PDF | option | /finance/statements/:id/pdf (ui) | member |
| `create.invitation` | Invite teammate | create | platform_invite_member (RPC) | admin |
| `invitation.revoke` | Revoke invitation | option | platform_revoke_invitation (RPC) | admin |
| `invitation.accept` | Accept invitation | option | platform_accept_invitation (RPC) | member |
| `create.out_of_office` | Out of office | create | platform_out_of_office (table) | member |
| `create.notification_preference` | Notification preference | create | platform_notification_preferences (table) | member |
| `create.custom_field` | Custom field | create | platform_custom_fields (table) | admin |
| `create.picklist_value` | Picklist value | create | platform_picklist_values (table) | admin |
| `pack.apply` | Apply industry pack | option | platform_apply_pack (RPC) | admin |
| `module.enable` | Turn module on / off | option | platform_enable_module (RPC) | admin |
| `role.assign` | Assign role / title | option | platform_assign_role (RPC) | admin |
| `role.revoke` | Remove role | option | platform_revoke_role (RPC) | admin |

## Navigation (feature tree)
| Nav path | Backing table |
| --- | --- |
| Finance/Overview | `acct_journal_entries` |
| Finance/Sales/Payment requests | `acct_payment_links` |
| Finance/Sales/Income over time | `acct_journal_entries` |
| Finance/Sales/Revenue transactions (Stripe webhook) | `acct_processor_events` |
| Finance/Sales/Invoices | `acct_ar_invoices` |
| Finance/Sales/Invoice lines | `acct_ar_invoice_lines` |
| Finance/Sales/Payment links | `acct_payment_links` |
| Finance/Sales/Receipts | `acct_ar_receipts` |
| Finance/Sales/Sales channels | `acct_channel_accounts` |
| Finance/Sales/Payouts | `acct_payouts` |
| Finance/Sales/Products & services | `acct_items` |
| Finance/Sales/Gift cards | `acct_gift_cards` |
| Finance/Sales/Subscriptions | `commerce_subscriptions` |
| Finance/Sales/Estimates | `acct_estimates` |
| Finance/Sales/Statements | `acct_customer_statements` |
| Finance/Sales/Refunds | `acct_refunds` |
| Finance/Sales/Disputes | `acct_disputes` |
| Finance/Sales/Credit memos | `acct_ar_credit_memos` |
| Finance/Expenses & Bills/Expenses | `acct_spend_transactions` |
| Finance/Expenses & Bills/Bills | `acct_ap_bills` |
| Finance/Expenses & Bills/Bill approvals | `acct_ap_approvals` |
| Finance/Expenses & Bills/Bill payments | `acct_ap_payments` |
| Finance/Expenses & Bills/Vendor credits | `acct_ap_vendor_credits` |
| Finance/Expenses & Bills/Recurring bills | `acct_recurring_bills` |
| Finance/Expenses & Bills/Receipt inbox | `acct_document_inbox` |
| Finance/Expenses & Bills/Contractors | `acct_contractor_invites` |
| Finance/Banking/Bank accounts | `acct_bank_accounts` |
| Finance/Banking/Transactions | `acct_bank_transactions` |
| Finance/Banking/Deposits | `acct_bank_deposits` |
| Finance/Banking/Transfers | `acct_bank_transfers` |
| Finance/Banking/Reconciliation | `acct_reconciliations` |
| Finance/Banking/Settlements | `acct_channel_settlements` |
| Finance/Accounting/Chart of accounts | `acct_chart_of_accounts` |
| Finance/Accounting/Journal entries | `acct_journal_entries` |
| Finance/Accounting/Fixed assets | `acct_fixed_assets` |
| Finance/Accounting/Debt | `acct_debt_instruments` |
| Finance/Accounting/Month-end close | `acct_close_tasks` |
| Settings/Workspace/Invitations | `platform_member_invitations` |
| Settings/Workspace/Out of office | `platform_out_of_office` |
| Settings/System/Notification preferences | `platform_notification_preferences` |
| Settings/Workspace/General | `tenant_settings` |
| Settings/Workspace/Teammates | `tenant_memberships` |
| Settings/Workspace/Roles and permissions | `platform_module_permissions` |
| Settings/Workspace/External access | `portal_account_links` |
| Settings/Workspace/Approvals and limits | `acct_ap_approvals` |
| Settings/Workspace/Office hours | `support_business_hours` |
| Settings/Workspace/Brands | `brands` |
| Settings/Workspace/Activity log | `platform_audit_events` |
| Settings/Workspace/Multilingual | `cms_locales` |
| Settings/Accounting/Chart of accounts | `acct_chart_of_accounts` |
| Settings/Accounting/Bank rules | `acct_bank_rules` |
| Settings/Accounting/Recurring templates | `acct_recurring_invoices` |
| Settings/Accounting/Budgets | `acct_budget_versions` |
| Settings/Accounting/Financial settings | `acct_settings` |
| Settings/CRM/Customer hub | `crm_settings` |
| Settings/CRM/Segments & lists | `crm_segments` |
| Settings/CRM/Lead capture | `crm_lead_sources` |
| Settings/Catalog/Pricing & discounts | `commerce_price_lists` |
| Settings/Catalog/Categories & tags | `tags` |
| Settings/Marketing/Social channels | `social_accounts` |
| Settings/Website/Website settings | `cms_website_settings` |
| Settings/Website/Navigation | `cms_navigation_menus` |
| Settings/Operations/Fulfillment & shipping | `shipping_profiles` |
| Settings/Operations/Carriers | `erp_carriers` |
| Settings/Operations/Inventory & warehouses | `erp_warehouses` |
| Settings/Operations/Printers | `tenant_printer_settings` |
| Settings/Analytics/KPI targets | `platform_kpi_targets` |
| Settings/Analytics/KPI definitions | `acct_kpi_definitions` |
| Settings/Support/Ticket channels | `support_channels` |
| Settings/Support/SLA policies | `support_sla_policies` |
| Settings/Support/Automation rules | `support_automations` |
| Settings/Suppliers/Supplier portal | `suppliers` |
| Settings/Suppliers/Contracts & pricing | `supplier_product_costs` |
| Settings/Suppliers/Compliance & 1099 | `acct_1099_thresholds` |
| Settings/System/Integrations | `integration_connections` |
| Settings/System/Data & privacy | `privacy_request_details` |
| Settings/System/Notifications | `user_notifications` |
| Settings/System/API tokens | `api_keys` |
| Settings/System/Audit log | `platform_audit_events` |
| Settings/System/Mailboxes | `platform_mailboxes` |
| Settings/System/Backups | `platform_backups` |
| Settings/Customization/Custom fields | `platform_custom_fields` |
| Settings/Customization/Picklists | `platform_picklist_values` |
| Settings/Customization/Terminology | `platform_terminology` |
| Settings/Customization/Record types | `crm_record_types` |
| Settings/Modules | `platform_tenant_modules` |
| Settings/Modules/Catalog | `platform_modules` |
| Settings/Modules/Industry packs | `platform_tenant_packs` |
| Settings/Modules/Pack contents | `platform_pack_items` |
| Settings/Privacy/Data classification | `platform_data_classes` |
| Settings/Privacy/Sensitive access log | `platform_sensitive_access_log` |
| Settings/Privacy/Deployment compliance | `platform_deployment_profile` |
| Settings/Workspace/Roles & titles | `platform_member_roles` |
| Settings/Workspace/Roles & titles/Role catalog | `platform_roles` |
| Settings/Workspace/Roles & titles/Aliases | `platform_role_aliases` |

## The database
**`11_finance_ledger_close_consolidation`** — 57 tables, 240 functions total.

Tables: `acct_account_balances`, `acct_account_dimension_rules`, `acct_account_roles`, `acct_allocation_rules`, `acct_allocations`, `acct_attachments`, `acct_audit_log`, `acct_auto_reversals`, `acct_book_account_mappings`, `acct_books`, `acct_budget_lines`, `acct_budget_versions`, `acct_chart_of_accounts`, `acct_close_checklists`, `acct_close_task_comments`, `acct_close_tasks`, `acct_close_template_tasks`, `acct_close_templates`, `acct_closes`, `acct_consolidation_groups`, `acct_consolidation_members`, `acct_consolidation_runs`, `acct_controls`, `acct_currencies`, `acct_dimension_values`, `acct_dimensions`, `acct_entities`, `acct_exchange_rates`, `acct_fiscal_years`, `acct_flux_explanations`, `acct_fx_revaluation_runs`, `acct_import_jobs`, `acct_integration_idempotency`, `acct_intercompany_partners`, `acct_intercompany_transactions`, `acct_journal_batches`, `acct_journal_entries`, `acct_journal_lines`, `acct_kpi_definitions`, `acct_legacy_map`, `acct_number_sequences`, `acct_periods`, `acct_recurring_journals`, `acct_report_packages`, `acct_report_snapshots`, `acct_review_comments`, `acct_review_findings`, `acct_review_ignore_rules`, `acct_review_runs`, `acct_settings`, `acct_transaction_templates`, `acct_workflow_actions`, `acct_workflow_instances`, `acct_workflows`, `chart_of_accounts`, `journal_entries`, `journal_lines`

RPCs (public-facing): `acct_accept_bank_transaction`, `acct_account_balance`, `acct_account_register`, `acct_add_fixed_asset`, `acct_add_tax_holiday`, `acct_address_text`, `acct_ai_context`, `acct_apply_bank_rules`, `acct_apply_credit_memo`, `acct_apply_unapplied_payment`, `acct_apply_vendor_credit`, `acct_approve_refund`, `acct_assert_access`, `acct_attach_standard_triggers`, `acct_audit_row_change`, `acct_available_credit`, `acct_balance_sheet`, `acct_bill_before_write`, `acct_bill_from_purchase_order`, `acct_bill_inventory_trg`, `acct_bill_line_after_write`, `acct_bill_line_before_write`, `acct_bill_refresh_status`, `acct_block_posted_mutation`, `acct_bootstrap_company`, `acct_budget_from_actuals`, `acct_budget_vs_actual`, `acct_build_amortization`, `acct_bulk_accept`, `acct_calculate_tax`, `acct_calculate_tax_summary`, `acct_can_access`, `acct_cancel_recognition_schedule`, `acct_cash_flow`, `acct_classify_bank_feed`, `acct_close_dispute`, `acct_close_fiscal_year`, `acct_close_status`, `acct_coa_before_write`, `acct_complete_close_task`, `acct_complete_contractor_profile`, `acct_convert_estimate`, `acct_create_credit_memo`, `acct_create_payment_link`, `acct_create_recognition_schedule` … and 146 more

**Totals: 57 tables, 191 public RPCs across these domains.**

## Gaps and what must be built
- **Decision D-2:** account type values (`income` vs `revenue`; COGS as subtype) — blocks the drawer. **D-3:** what `is_control_account` blocks.
- **APIs:** account CRUD + merge, register endpoint, journal-entry family, period-lock enforcement in `acct_post_journal`.
- **Types:** `Account`, `AccountType`, `JournalEntry`, `JournalLine`.
