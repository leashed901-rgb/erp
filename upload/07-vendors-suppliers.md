# Vendors, Suppliers & Contractors
**Status:** PARTIAL

## What it is
The pay-side parties: **Vendor** = operating costs; **Supplier** = fulfills your products (feeds POs, blanks, integrations); **Contractor** = 1099 worker with W-9 invite. All Party roles on one drawer, different sections.

## The experience
- **Vendors tab** (inside Expenses) — Vendor · Open balance · Last bill · YTD spend · 1099 flag · Payment method (ACH-ready pill).
- **Contractors tab** — Name · Email invite · W-9 status pill (Invited/Completed/Missing) · Tax profile · YTD paid · **Pay and file 1099s**.
- **Suppliers** — catalog feed, lead time, MOQ, cost (`supplier_product_costs`), fulfillment locations, supplier portal.
- **Registry:** `create.vendor`, `create.supplier`, `create.contractor` (`acct_invite_contractor`), `tax.generate_1099s`.

## Code today
- **Components:** `expenses-bills/Vendors.tsx`, `contacts/PartyFormDrawer.tsx`
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
| `create.customer` | Add customer | create | crm_customers (table) | member |
| `create.expense` | Expense (txn_kind = expense) | create | acct_spend_transactions (table) | member |
| `create.check` | Check (txn_kind = check) | create | acct_spend_transactions (table) | member |
| `create.bill` | Bill | create | acct_ap_bills (table) | member |
| `create.pay_bills` | Pay bills | create | acct_pay_bills (RPC) | member |
| `create.vendor_credit` | Vendor credit | create | acct_ap_vendor_credits (table) | member |
| `create.vendor` | Add vendor | create | acct_vendors (table) | member |
| `create.supplier` | Add supplier | create | suppliers (table) | member |
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
| `create.note` | Add note | create | crm_notes (table) | member |
| `create.void` | Void | create | app_void (RPC) | member |
| `create.appointment` | Book appointment | create | crm_book_appointment (RPC) | member |
| `party.open_profile` | Open profile | option | /crm/parties/:id (ui) | member |
| `party.email` | Email | option | email_enqueue (RPC) | member |
| `party.add_role` | Add role | option | platform_party_add_role (RPC) | member |
| `party.merge` | Merge duplicates | option | platform_party_merge (RPC) | admin |
| `party.archive` | Archive | option | app_archive_record (RPC) | member |
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
| `appointment.reschedule` | Reschedule | option | crm_reschedule_appointment (RPC) | member |
| `appointment.cancel` | Cancel appointment | option | crm_cancel_appointment (RPC) | member |
| `appointment.check_in` | Check in / complete / no-show | option | crm_set_appointment_status (RPC) | member |
| `appointment.slots` | Find open slots | option | crm_available_slots (RPC) | member |
| `create.deal` | Deal | create | crm_deals (table) | member |
| `deal.move` | Move deal to stage | option | crm_move_deal (RPC) | member |
| `lead.convert` | Convert lead to deal | option | crm_convert_lead (RPC) | member |
| `lead.rescore` | Recalculate lead score | option | crm_score_lead (RPC) | member |
| `create.pipeline` | Pipeline | create | crm_pipelines (table) | admin |
| `create.lead_scoring_rule` | Lead scoring rule | create | crm_lead_scoring_rules (table) | admin |
| `call.start` | Call (click-to-call) | option | crm_start_call (RPC) | member |
| `create.mailbox` | Connect mailbox | create | platform_mailboxes (table) | member |
| `email.send` | Send email | create | platform_send_email (RPC) | member |
| `route.build` | Build route for the day | create | crm_build_route (RPC) | member |
| `create.tracked_record` | Tracked record (pet, vehicle, policy, property, student...) | create | crm_dependents (table) | member |
| `create.record_event` | Record event (service visit, claim, enrollment...) | create | crm_record_events (table) | member |

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
| Contacts/CRM overview | `crm_customers` |
| Contacts/Parties | `platform_parties` |
| Contacts/Parties/Customers | `crm_customers` |
| Contacts/Parties/Customer AR profiles | `acct_customers` |
| Contacts/Parties/Vendors | `acct_vendors` |
| Contacts/Parties/Suppliers | `suppliers` |
| Contacts/Seller relationships/Sellers | `sellers` |
| Contacts/Seller relationships/Seller detail | `seller_self_serve_profiles` |
| Contacts/Seller relationships/Seller feed | `seller_social_posts` |
| Contacts/Seller relationships/Onboarding queue | `onboarding_cases` |
| Contacts/CRM tools/Leads | `crm_leads` |
| Contacts/CRM tools/Segments | `crm_segments` |
| Contacts/CRM tools/Templates | `crm_message_templates` |
| Contacts/CRM tools/Appointments | `crm_appointments` |
| Contacts/CRM tools/Appointments/Services | `crm_services` |
| Contacts/CRM tools/Appointments/Staff | `crm_staff` |
| Contacts/CRM tools/Appointments/Resources | `crm_appointment_resources` |
| Contacts/CRM tools/Appointments/Booking policies | `crm_booking_policies` |
| Contacts/CRM tools/Appointments/Blocked times | `crm_staff_blocked_times` |
| Contacts/CRM tools/Appointments/Dependents | `crm_dependents` |
| Contacts/CRM tools/Appointments/Status history | `crm_appointment_status_history` |
| Contacts/CRM tools/Appointments/Register sessions | `commerce_register_sessions` |
| Contacts/CRM tools/Deals | `crm_deals` |
| Contacts/CRM tools/Deals/Stage history | `crm_deal_stage_history` |
| Contacts/CRM tools/Pipelines | `crm_pipelines` |
| Contacts/CRM tools/Pipelines/Stages | `crm_pipeline_stages` |
| Contacts/CRM tools/Lead scoring | `crm_lead_scoring_rules` |
| Contacts/CRM tools/Lead scoring/Score bands | `crm_lead_score_bands` |
| Contacts/CRM tools/Calls | `crm_calls` |
| Contacts/CRM tools/Inbox | `platform_email_threads` |
| Contacts/CRM tools/Inbox/Messages | `platform_email_messages` |
| Contacts/CRM tools/Routes | `crm_routes` |
| Contacts/CRM tools/Routes/Stops | `crm_route_stops` |
| Contacts/CRM tools/Records | `crm_dependents` |
| Contacts/CRM tools/Records/Record types | `crm_record_types` |
| Contacts/CRM tools/Records/Events | `crm_record_events` |
| Contacts/CRM tools/Records/Related parties | `crm_record_parties` |
| Contacts/CRM tools/Documents | `crm_documents` |
| Contacts/CRM tools/Activity | `crm_activity` |

## The database
**`03_contacts_parties_crm`** — 66 tables, 15 functions total.

Tables: `acct_customers`, `acct_party_addresses`, `acct_vendors`, `commerce_register_sessions`, `crm_activity`, `crm_appointment_resources`, `crm_appointment_services`, `crm_appointment_status_history`, `crm_appointments`, `crm_audit_log`, `crm_automation_enrollments`, `crm_automation_runs`, `crm_automation_workflows`, `crm_booking_policies`, `crm_communication_preferences`, `crm_conversations`, `crm_customer_behavior`, `crm_customer_contact_methods`, `crm_customer_preferences`, `crm_customer_tag_assignments`, `crm_customer_tags`, `crm_customers`, `crm_dependents`, `crm_document_types`, `crm_document_versions`, `crm_documents`, `crm_duplicate_candidates`, `crm_external_identities`, `crm_holiday_blackouts`, `crm_households`, `crm_idempotency_keys`, `crm_lead_activities`, `crm_lead_sources`, `crm_leads`, `crm_locations`, `crm_merge_log`, `crm_messages`, `crm_needs_attention`, `crm_notes`, `crm_operating_hours`, `crm_party_dependents`, `crm_permanent_alerts`, `crm_pricing_rules`, `crm_product_recommendations`, `crm_saved_views`, `crm_search_index`, `crm_segment_memberships`, `crm_segments`, `crm_service_location_availability`, `crm_service_package_items`, `crm_service_packages`, `crm_services`, `crm_settings`, `crm_staff_blocked_times`, `crm_surcharges`, `crm_tags`, `crm_waitlist`, `customer_addresses`, `customer_ai_disclosure_acks`, `customer_memberships`, `customers`, `platform_parties`, `platform_party_sources`, `platform_report_definitions`, `portal_customer_accounts`, `vendors`

RPCs (public-facing): `crm__appointment_after`, `crm__appointment_before`, `crm__assert_member`, `crm__policy`, `crm__refresh_customer_visits`, `crm__service_minutes`, `crm_available_slots`, `crm_book_appointment`, `crm_cancel_appointment`, `crm_has_tenant_access`, `crm_reschedule_appointment`, `crm_set_appointment_status`, `platform_party_add_role`, `platform_party_backfill`, `platform_party_merge`

**`14_finance_expenses_payables`** — 22 tables, 6 functions total.

Tables: `acct_ap_approvals`, `acct_ap_bill_lines`, `acct_ap_bills`, `acct_ap_payment_applications`, `acct_ap_payments`, `acct_ap_purchase_order_lines`, `acct_ap_purchase_orders`, `acct_ap_vendor_credit_applications`, `acct_ap_vendor_credit_lines`, `acct_ap_vendor_credits`, `acct_document_inbox`, `acct_expense_lines`, `acct_expense_reports`, `acct_receipt_extractions`, `acct_recurring_bills`, `acct_spend_lines`, `acct_spend_transactions`, `acct_vendor_aliases`, `bill_items`, `bills`, `vendor_invoice_lines`, `vendor_invoices`

RPCs (public-facing): `acct_spend_before_insert`, `acct_spend_inventory_trg`, `acct_spend_line_after_write`, `acct_spend_line_before_write`, `convert_purchase_order_to_bill`, `create_bill`

**Totals: 88 tables, 21 public RPCs across these domains.**

## Gaps and what must be built
- W-9 invite flow UI (RPC `acct_invite_contractor` exists), 1099 workspace, supplier-portal screens, `supplier_*` feed screens.
- **Types:** `VendorProfile`, `SupplierProfile`, `ContractorProfile`, `W9Status`.
