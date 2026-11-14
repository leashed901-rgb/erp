# Contacts & CRM (Parties)
**Status:** LIVE

## What it is
The single home for every person and company — customers, vendors, suppliers, contractors, sellers, leads. One record per human, many roles. Every other module's Party pill resolves here. `platform_parties` is the spine; `crm_customers`, `acct_vendors`, `suppliers`, `crm_leads`, `sellers` are role projections.

## The experience
- **Parties list** — columns: name, role pills, email, phone, open balance, lifetime value, last activity, segment pills, owner. Tabs: All · Customers · Vendors · Suppliers · Contractors · Sellers · Leads · Archived. Default sort: last activity desc.
- **Party drawer** (the most reused component) — identity, address (shipping vs billing), finance (terms, currency, default category, tax-exempt, Bill Pay ACH masked, 1099 flag), role-specific sections (customer: price list, credit limit, statement preference; vendor/supplier: lead time, MOQ, catalog feed; contractor: W-9 invite; seller: payout, onboarding status), notes and attachments.
- **Party detail** — drawer expanding to a page; tabs: Overview · Transactions · Orders · Tickets · Files · Activity. Header: Email · Create (role-aware).
- **Peek popover** — balance, last transaction, open tickets, next task, segment.

## Code today
- **Components:** `contacts/ContactsParties.tsx`, `CrmOverviewSupabase.tsx`, `CustomersSupabase.tsx`, `PartyFormDrawer.tsx`, `PartyProfile.tsx`
- **API routes:**
| Route | Methods |
| --- | --- |
| /api/crm/customers/ | GET, POST |
| /api/crm/customers/[id]/ | DELETE, GET, PATCH |
| /api/parties/ | GET, POST |
| /api/parties/[id]/ | DELETE, GET, PATCH |

## Registered actions
| Action code | Display name | Kind | Bound to | Access |
| --- | --- | --- | --- | --- |
| `create.customer` | Add customer | create | crm_customers (table) | member |
| `create.vendor` | Add vendor | create | acct_vendors (table) | member |
| `create.supplier` | Add supplier | create | suppliers (table) | member |
| `create.note` | Add note | create | crm_notes (table) | member |
| `create.appointment` | Book appointment | create | crm_book_appointment (RPC) | member |
| `party.open_profile` | Open profile | option | /crm/parties/:id (ui) | member |
| `party.email` | Email | option | email_enqueue (RPC) | member |
| `party.add_role` | Add role | option | platform_party_add_role (RPC) | member |
| `party.merge` | Merge duplicates | option | platform_party_merge (RPC) | admin |
| `party.archive` | Archive | option | app_archive_record (RPC) | member |
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

**Totals: 66 tables, 15 public RPCs across these domains.**

## Gaps and what must be built
- **Types:** canonical `Party` DTO derived from `platform_parties` (today `partyMirror.ts` hand-maps four source tables — the "four vendor tables" finding).
- **APIs/RPCs:** `GET /parties/{id}/impact` (shared-record banner), `GET /peek/party/{id}`, merge/dedupe endpoints.
- **Schema:** two segment systems (`crm_segments` vs `cms_audience_segments`) — pick canonical.
