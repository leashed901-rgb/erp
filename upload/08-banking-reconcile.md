# Banking, Transactions & Reconcile
**Status:** PARTIAL

## What it is
The books' front door: bank transactions for review, rules that auto-categorize, reconciliation against statements, deposits, transfers, and channel settlements that split a payout into gross/fees/refunds/disputes/net. Teller integration syncs accounts (`teller_*` RPCs).

## The experience
- **Bank transactions** — ☐ · Date · Description · Payee pill · Category · Amount in/out · Status pill (For review / Matched / Categorized / Excluded) · Match pill · Receipt icon. Row: **Match** (suggested docs) | **Categorize** (Account picker) | **Create ▸** Expense · Bill payment · Transfer · Deposit.
- **Reconcile** — setup modal (account, statement ending balance + date, service charge, interest earned) → two-column workspace, live Difference meter, Finish.
- **Bank rules** — priority-ordered list (drag to reorder), condition builder, actions (categorize, set payee, tag, mark transfer, exclude), auto-apply vs suggest, live preview, apply-to-existing with dry run + undo.
- **Registry:** `create.transfer` (`acct_transfer_funds`), `create.reconcile` (`acct_start_reconciliation`), `create.bank_deposit` (`acct_make_deposit`), `create.settlement`.

## Code today
- **Components:** `finance/BankTransactionsScreen.tsx`, `BankRulesScreen.tsx`, `ReconcileScreen.tsx`, `CashFlowScreen.tsx`
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

## The database
**`12_finance_banking_treasury`** — 32 tables, 16 functions total.

Tables: `acct_bank_accounts`, `acct_bank_deposit_lines`, `acct_bank_deposits`, `acct_bank_rule_conditions`, `acct_bank_rule_splits`, `acct_bank_rules`, `acct_bank_statements`, `acct_bank_transactions`, `acct_bank_transfers`, `acct_channel_accounts`, `acct_channel_settlement_lines`, `acct_channel_settlements`, `acct_debt_instruments`, `acct_debt_schedule`, `acct_gateway_clearing_entries`, `acct_payouts`, `acct_processor_events`, `acct_reconciliation_items`, `acct_reconciliations`, `acct_scheduled_payments`, `bank_accounts`, `bank_transactions`, `payment_transactions`, `paypal_webhook_events`, `reconciliations`, `stripe_pending_charges`, `stripe_webhook_events`, `teller_accounts`, `teller_balances`, `teller_enrollments`, `teller_sign_convention`, `teller_transactions`

RPCs (public-facing): `acct_bank_account_check`, `acct_bank_descriptor_trg`, `acct_bank_gl`, `acct_bank_match_candidates`, `acct_bank_rule_matches`, `acct_bank_txn_before_insert`, `acct_debt_balance`, `acct_reconciliation_mark`, `acct_reconciliation_summary`, `teller_ingest_transactions`, `teller_next_sync_window`, `teller_process_webhook`, `teller_record_api_error`, `teller_record_balance`, `teller_register_enrollment`, `teller_upsert_account`

**`11_finance_ledger_close_consolidation`** — 57 tables, 240 functions total.

Tables: `acct_account_balances`, `acct_account_dimension_rules`, `acct_account_roles`, `acct_allocation_rules`, `acct_allocations`, `acct_attachments`, `acct_audit_log`, `acct_auto_reversals`, `acct_book_account_mappings`, `acct_books`, `acct_budget_lines`, `acct_budget_versions`, `acct_chart_of_accounts`, `acct_close_checklists`, `acct_close_task_comments`, `acct_close_tasks`, `acct_close_template_tasks`, `acct_close_templates`, `acct_closes`, `acct_consolidation_groups`, `acct_consolidation_members`, `acct_consolidation_runs`, `acct_controls`, `acct_currencies`, `acct_dimension_values`, `acct_dimensions`, `acct_entities`, `acct_exchange_rates`, `acct_fiscal_years`, `acct_flux_explanations`, `acct_fx_revaluation_runs`, `acct_import_jobs`, `acct_integration_idempotency`, `acct_intercompany_partners`, `acct_intercompany_transactions`, `acct_journal_batches`, `acct_journal_entries`, `acct_journal_lines`, `acct_kpi_definitions`, `acct_legacy_map`, `acct_number_sequences`, `acct_periods`, `acct_recurring_journals`, `acct_report_packages`, `acct_report_snapshots`, `acct_review_comments`, `acct_review_findings`, `acct_review_ignore_rules`, `acct_review_runs`, `acct_settings`, `acct_transaction_templates`, `acct_workflow_actions`, `acct_workflow_instances`, `acct_workflows`, `chart_of_accounts`, `journal_entries`, `journal_lines`

RPCs (public-facing): `acct_accept_bank_transaction`, `acct_account_balance`, `acct_account_register`, `acct_add_fixed_asset`, `acct_add_tax_holiday`, `acct_address_text`, `acct_ai_context`, `acct_apply_bank_rules`, `acct_apply_credit_memo`, `acct_apply_unapplied_payment`, `acct_apply_vendor_credit`, `acct_approve_refund`, `acct_assert_access`, `acct_attach_standard_triggers`, `acct_audit_row_change`, `acct_available_credit`, `acct_balance_sheet`, `acct_bill_before_write`, `acct_bill_from_purchase_order`, `acct_bill_inventory_trg`, `acct_bill_line_after_write`, `acct_bill_line_before_write`, `acct_bill_refresh_status`, `acct_block_posted_mutation`, `acct_bootstrap_company`, `acct_budget_from_actuals`, `acct_budget_vs_actual`, `acct_build_amortization`, `acct_bulk_accept`, `acct_calculate_tax`, `acct_calculate_tax_summary`, `acct_can_access`, `acct_cancel_recognition_schedule`, `acct_cash_flow`, `acct_classify_bank_feed`, `acct_close_dispute`, `acct_close_fiscal_year`, `acct_close_status`, `acct_coa_before_write`, `acct_complete_close_task`, `acct_complete_contractor_profile`, `acct_convert_estimate`, `acct_create_credit_memo`, `acct_create_payment_link`, `acct_create_recognition_schedule` … and 146 more

**Totals: 89 tables, 207 public RPCs across these domains.**

## Gaps and what must be built
- **APIs:** `GET /bank-transactions` + match/categorize/create-from routes; `POST /reconciliations` + `/finish`; bank-rules CRUD route; journal-entry CRUD; settlement workspace over `acct_channel_settlements` + `acct_channel_settlement_lines` + `acct_payouts`.
- **Types:** `BankTransaction`, `MatchCandidate`, `Reconciliation`, `JournalEntry`, `SettlementSplit`, `BankRule`.
