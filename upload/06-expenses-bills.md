# Expenses, Bills & Approvals
**Status:** MIRROR

## What it is
Everything you pay: bills, expenses, checks, vendor credits, card credits — one spend family (`acct_spend_transactions` with `txn_kind`). The automation funnel: upload & auto-create → For review → Approval → Paid. Receipt inbox (`acct_document_inbox`) and OCR extraction (`acct_receipt_extractions`) are backed.

## The experience
- **Bills list** — ☐ · Vendor pill · Bill no · Bill date · Due date · Amount · Open balance · Status pill · Approval pill · Source pill. Tabs: For review · Unpaid · Paid. Row action changes by status: Review → Approve → Pay.
- **Add bill** — drawer that promotes to full document page; capture panel (autofill · upload · photo → OCR); category lines and item lines in two tabs; line actions add/clear/copy/tag/delete; Make recurring; Save · Save and schedule · Print.
- **Pay bills** — workspace: payment account, date, starting check #; rows with credits and payments; totals.
- **Registry actions:** `bill.approve` (`acct_decide_bill`), `bill.submit`, `bill.post`, `bill.categorize` (`acct_mark_bill_reviewed`), `bill.match` (`acct_po_match`), `bill.schedule_payment`, `bill.from_inbox`.

## Code today
- **Components:** `expenses-bills/ExpensesBillsOverview.tsx`, `PayBills.tsx`, `finance/BillsScreen.tsx`, `EXPENSE_DRAWER` in `RecordDrawer.tsx`
- **API routes:**
| Route | Methods |
| --- | --- |
| /api/crm/bills/ | GET, POST |
| /api/crm/bills/[id]/ | DELETE, PATCH |

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
**`14_finance_expenses_payables`** — 22 tables, 6 functions total.

Tables: `acct_ap_approvals`, `acct_ap_bill_lines`, `acct_ap_bills`, `acct_ap_payment_applications`, `acct_ap_payments`, `acct_ap_purchase_order_lines`, `acct_ap_purchase_orders`, `acct_ap_vendor_credit_applications`, `acct_ap_vendor_credit_lines`, `acct_ap_vendor_credits`, `acct_document_inbox`, `acct_expense_lines`, `acct_expense_reports`, `acct_receipt_extractions`, `acct_recurring_bills`, `acct_spend_lines`, `acct_spend_transactions`, `acct_vendor_aliases`, `bill_items`, `bills`, `vendor_invoice_lines`, `vendor_invoices`

RPCs (public-facing): `acct_spend_before_insert`, `acct_spend_inventory_trg`, `acct_spend_line_after_write`, `acct_spend_line_before_write`, `convert_purchase_order_to_bill`, `create_bill`

**Totals: 22 tables, 6 public RPCs across these domains.**

## Gaps and what must be built
- **Namespace:** bills live under `/api/crm/bills` — move to `/api/bills` or the document family.
- **CapturePanel** (OCR) — client component missing; storage exists.
- **Upload-multiple-bills workspace** (drop zone → OCR queue → For review).
- **Decision D-1:** `acct_workflows` vs `acct_ap_approvals` — one source of truth for approvals.
- **Types:** `BillDef`, `SpendRecord` union, `ApprovalSummary`.
