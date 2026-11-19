# KPI definitions

One definition per KPI, used identically in SQL (`marts.*`), in the dashboard (`web/lib/metrics.ts`) and in Looker Studio. *SIMULATED data.*

| KPI | Formula | Source of truth | Day / time zone | Exclusions |
|---|---|---|---|---|
| **Submissions** | count of CRM records | `core.leads` (CRM export) | brand's local day | none |
| **Leads** | submissions − duplicates | `audit.lead_status` | local day | duplicates (same normalized phone or e-mail, same brand, previous 30 days) |
| **Qualified leads** | leads − spam − invalid | `audit.lead_status` | local day | spam score ≥ 0.6; phone that cannot exist in the US or malformed e-mail |
| **Booked jobs** | qualified leads in stage Booked or Won | CRM stage | local day of the lead | non-qualified leads |
| **Spend** | Google Ads cost + Meta amount spent + LSA charges − approved LSA credits | platform exports (`core.spend_daily.net_cost`) | account time zone = brand's local day | pending disputes are not deducted |
| **Cost per lead (CPL)** | spend ÷ leads from paid channels | spend + `core.touches` | local day | organic, GBP, direct and referral leads (no media cost) |
| **Cost per qualified lead (CPQL)** | spend ÷ qualified leads from paid channels | as above | local day | as above |
| **Leads per 10,000 residents** | qualified leads per year ÷ county population × 10,000 | `core.brands.population_2025` (US Census, PUBLIC DATA) | yearly rate | none |
| **Platform / CRM ratio** | platform-reported leads ÷ comparable CRM leads | `marts.reconciliation_daily` | local day (UTC shown only to explain gaps) | depends on the system, see RECONCILIATION_METHOD.md |
| **Data Trust Score** | 100 × (pass + explained + ½ warn) ÷ judged check runs | `audit.check_results` | per brand and day | runs marked n/a (too little data, warm-up) |

## Channel
The **corrected channel** (`core.touches.corrected_channel`) is used everywhere. It is decided by evidence in a fixed priority: integration label (LSA, Meta Lead Ads, GBP calls) → gclid → fbclid → UTM → paid-only landing page (/lp/, /offer/) → referrer → staff call log → CRM label → direct. Click ids, UTMs and integration labels are **Verified**; the rest is **Inferred** and shown as such.

## Trust badges
- **Verified** (filled dot): the KPI's audit checks passed on ≥ 95% of runs in the period.
- **Reconciled** (ring): the KPI matches the platform exports after documented adjustments (≥ 90% of reconciliation checks pass).
- **At risk** (triangle): below those thresholds; open the Trace drawer to see which check failed.

## History
Closed months are frozen in `audit.kpi_snapshots`. Channel mappings are versioned (`core.channel_map_scd2`, valid_from / valid_to): a mapping change applies from its start date and never rewrites a closed month. The test `tests/sql.test.ts` fails if it does.
