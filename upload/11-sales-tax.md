# Sales Tax Engine
**Status:** PARTIAL (the named build blocker)

## What it is
Rates and jurisdictions, nexus rules and alerts, taxability rules, exemptions (with certificates), tax transactions per document line, filings by period, marketplace remittance (marketplace-collected tax excluded from your liability).

## The experience
- **Jurisdictions** — code, name, country/state/locality, registration number. **Rates** — `acct_tax_codes` with rate, recoverable %, payable/receivable accounts, effective dates, compound flag.
- **Filings** — period, taxable sales, collected, remitted, status, confirmation ref; **Pay sales tax** workspace (like Pay bills).
- **Registry:** `create.sales_tax_filing` (`acct_prepare_sales_tax_filing`), `tax.calculate` (`acct_calculate_tax`), `tax.pay_filing` (`acct_pay_sales_tax_filing`).

## Code today
- **Components:** `business-tax/` screens; per-line tax in `DocumentEngine.tsx`
- **API routes:** none built yet for this module.

## Registered actions
| Action code | Display name | Kind | Bound to | Access |
| --- | --- | --- | --- | --- |
| `create.sales_tax_filing` | Prepare sales tax filing | create | acct_prepare_sales_tax_filing (RPC) | member |
| `tax.calculate` | Calculate tax | option | acct_calculate_tax (RPC) | member |
| `tax.pay_filing` | Pay sales tax filing | option | acct_pay_sales_tax_filing (RPC) | member |

## Navigation (feature tree)
| Nav path | Backing table |
| --- | --- |
| Sales Tax/Jurisdictions | `acct_tax_jurisdictions` |
| Sales Tax/Rates | `acct_tax_rates` |
| Sales Tax/Nexus | `acct_tax_nexus` |
| Sales Tax/Nexus alerts | `tax_nexus_alerts` |
| Sales Tax/Taxability rules | `acct_tax_taxability_rules` |
| Sales Tax/Exemptions | `acct_tax_exemptions` |
| Sales Tax/Tax transactions | `acct_tax_transactions` |
| Sales Tax/Filings | `acct_tax_filings` |
| Sales Tax/Marketplace remittance | `seller_tax_remittance_filings` |

## The database
**`17_sales_tax`** — 18 tables, 5 functions total.

Tables: `acct_tax_categories`, `acct_tax_codes`, `acct_tax_exemptions`, `acct_tax_filings`, `acct_tax_jurisdictions`, `acct_tax_lines`, `acct_tax_nexus`, `acct_tax_rates`, `acct_tax_rules`, `acct_tax_taxability_rules`, `acct_tax_transactions`, `geo_zip_cache`, `jurisdiction_rules`, `seller_tax_exemptions`, `seller_tax_remittance_filings`, `state_rules`, `tax_nexus_alerts`, `taxes`

RPCs (public-facing): `acct_tax_chain`, `tax_nexus_exposure`, `tax_refresh_nexus_alerts`, `tax_us_sales_by_state`, `tax_us_windows`

**Totals: 18 tables, 5 public RPCs across these domains.**

## Gaps and what must be built
- **Decision D-6:** make `acct_tax_codes` + `acct_tax_jurisdictions` canonical; retire `acct_tax_rules`/`acct_tax_rates`/`taxes`.
- **Missing fields:** per-item tax category (Item drawer), per-customer exemption + certificate upload (Party drawer).
- **Engine:** per-line calculation in the Document Engine totals block; marketplace-collected flag on channel orders.
- **Types:** `TaxJurisdiction`, `TaxCode`, `TaxFiling`, `TaxTransaction`.
