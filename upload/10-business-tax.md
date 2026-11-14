# Business Tax & 1099s
**Status:** PARTIAL

## What it is
The tax cockpit: taxable profit estimate, deductible expenses with source counts, 1099-K detail, 1099 generation, payroll tax forms, year-end e-file (`efile_filings`, `mef_*` tables).

## The experience
- **Overview** — Taxable profit estimate, taxable income, deductible expenses (Category · Amount · % deductible · Source count pill → filtered transactions), depreciable assets, income from transactions.
- **Alert pills** — Uncategorized transactions, Missing W-9, Unreconciled accounts — each opens its fix surface.
- **Registry:** `tax.generate_1099s` (`acct_generate_1099s`, admin), `create.tax return` (`efile_filings`).

## Code today
- **Components:** `business-tax/BusinessTaxOverview.tsx`, `TaxSummary.tsx`, `YearEndFiling.tsx`, `types.ts`
- **API routes:** none built yet for this module.

## Registered actions
| Action code | Display name | Kind | Bound to | Access |
| --- | --- | --- | --- | --- |
| `tax.generate_1099s` | Generate 1099s | option | acct_generate_1099s (RPC) | admin |

## Navigation (feature tree)
| Nav path | Backing table |
| --- | --- |
| Business tax/Overview | `acct_tax_transactions` |
| Business tax/Create tax return | `efile_filings` |
| Business tax/Tax summary/Taxable profit estimate | `acct_journal_entries` |
| Business tax/Tax summary/Deductible expenses | `acct_spend_transactions` |
| Business tax/Tax summary/Depreciable business assets | `acct_fixed_assets` |
| Business tax/1099-K detail | `seller_1099k_generations` |
| Business tax/1099s | `acct_1099_thresholds` |
| Business tax/Payroll tax | `acct_payroll_tax_forms` |
| Business tax/Year-end tax filing | `efile_filings` |

## The database
**`18_business_tax_e_file`** — 36 tables, 68 functions total.

Tables: `efile_acknowledgements`, `efile_errors`, `efile_filing_records`, `efile_filings`, `efile_form_types`, `efile_state_settings`, `efile_submissions`, `efile_transmitter_credentials`, `mef_ack_errors`, `mef_acknowledgements`, `mef_ats_status`, `mef_billable_events`, `mef_business_rules`, `mef_compliance_controls`, `mef_fee_schedule`, `mef_form_families`, `mef_payroll_constants`, `mef_providers`, `mef_reporting_agent_auth`, `mef_return_versions`, `mef_returns`, `mef_schema_versions`, `mef_security_incidents`, `mef_signatures`, `mef_signers`, `mef_submissions`, `mef_transmissions`, `partnership18`, `tax16`, `tax_consent_items`, `tax_consents`, `tax_disclosure_documents`, `tax_disclosure_items`, `tax_screen_presentations`, `tax_us_states`, `taxprod`

RPCs (public-facing): `efile_build_1099_filing`, `efile_build_payroll_filing`, `efile_build_sales_tax_filing`, `efile_claim`, `efile_mark_filed_manually`, `efile_queue`, `efile_record_acknowledgement`, `efile_record_submission`, `mef__aba_ok`, `mef__efile_paused`, `mef__family_for`, `mef__headline`, `mef__incident_due_trg`, `mef__pdf_name_ok`, `mef__queue_issues`, `mef__queue_issues_for_claim`, `mef__rand_alnum`, `mef__return_after_trg`, `mef__return_before_trg`, `mef__return_hash`, `mef__signature_immutable_trg`, `mef__submission_id_ok`, `mef_build_941`, `mef_claim`, `mef_create_return`, `mef_ero_certify`, `mef_new_message_id`, `mef_new_submission_id`, `mef_queue_return`, `mef_readiness`, `mef_record_ack`, `mef_record_transmission`, `mef_record_transmission_failure`, `mef_set_efw`, `mef_set_environment`, `mef_sign_return`, `mef_signature_screen`, `mef_signer_set_online_pin`, `mef_signer_upsert`, `mef_update_return_data`, `mef_void_return`, `partnership18_calculate`, `partnership18_save`, `partnership18_split`, `tax16_claim_job` … and 23 more

**Totals: 36 tables, 68 public RPCs across these domains.**

## Gaps and what must be built
- **APIs:** `GET /tax/summary`, `/tax/filings`; 1099 workspace; **Types:** `TaxSummary`, `DeductionCategory`, `Form1099`.
- Wire deductible drill-downs and W-9 gating (missing W-9 blocks 1099 generation).
