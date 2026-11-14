# Estimates & Quotes
**Status:** MIRROR

## What it is
Quotes that convert: estimate with expiry date, status machine (draft → sent → accepted/declined/expired → converted), one-click conversion to invoice carrying all relations.

## The experience
- **List** — ☐ · Estimate # · Customer pill · Issue date · Expiry · Status pill · Total. Tabs: All · Draft · Sent · Accepted · Declined · Expired · Converted.
- **Page** — same Document Engine; button **Convert to invoice** (`acct_convert_estimate`).
- Right-click: convert, duplicate, send, PDF, void.

## Code today
- **Components:** `finance/EstimatesScreen.tsx`, `DocumentEngine.tsx`
- **API routes:**
| Route | Methods |
| --- | --- |
| /api/estimates/ | GET, POST |

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
**`13_finance_sales_receivables`** — 39 tables, 7 functions total.

Tables: `acct_ar_collections_cases`, `acct_ar_credit_memos`, `acct_ar_invoice_lines`, `acct_ar_invoices`, `acct_ar_receipt_applications`, `acct_ar_receipts`, `acct_credit_memo_applications`, `acct_customer_statements`, `acct_disputes`, `acct_estimate_lines`, `acct_estimates`, `acct_gift_card_transactions`, `acct_gift_cards`, `acct_order_payments`, `acct_order_postings`, `acct_payment_links`, `acct_payment_terms`, `acct_price_book_lines`, `acct_price_books`, `acct_recognition_lines`, `acct_recognition_schedules`, `acct_recurring_invoice_lines`, `acct_recurring_invoices`, `acct_refund_policies`, `acct_refunds`, `acct_revenue_contracts`, `acct_revenue_performance_obligations`, `acct_revenue_recognition_schedules`, `acct_statement_batches`, `chargeback_details`, `customer_statements`, `estimate_items`, `estimates`, `invoice_items`, `invoices`, `receipt_items`, `receipts`, `recurring_invoice_items`, `recurring_invoices`

RPCs (public-facing): `acct_gift_card_check`, `acct_recognition_tieout`, `acct_refund_inventory_trg`, `convert_sales_order_to_invoice`, `create_receipt`, `generate_customer_statement`, `take_payment`

**Totals: 39 tables, 7 public RPCs across these domains.**

## Gaps and what must be built
- Wire conversion to the registry RPC; auto-expiry job; **Types:** `Estimate`, `EstimateLine` (client types exist in `accountingTypes.ts` — reconcile with `acct_estimates` columns).
