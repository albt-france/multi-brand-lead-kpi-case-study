# Data dictionary

Generated from the database (`npm run docs`). Schemas: **raw** (as exported, all text), **staging** (normalized), **core** (business model), **audit** (rules, verdicts, checks, history), **marts** (views read by the dashboard and Looker Studio).


## raw.brands

Brand reference: city, IANA time zone, county and population (US Census 2025, PUBLIC DATA).

| Column | Type | Nullable |
|---|---|---|
| brand | text | yes |
| trade | text | yes |
| city | text | yes |
| tz | text | yes |
| fips | text | yes |
| county | text | yes |
| population_2025 | text | yes |

## raw.crm_contacts

CRM export as received (GoHighLevel format, UTC timestamps). Never edited.

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | yes |
| brand | text | yes |
| created_at_utc | text | yes |
| lead_type | text | yes |
| form_id | text | yes |
| attribution_source | text | yes |
| utm_source | text | yes |
| utm_medium | text | yes |
| utm_campaign | text | yes |
| gclid | text | yes |
| fbclid | text | yes |
| landing_page | text | yes |
| referrer | text | yes |
| phone | text | yes |
| email | text | yes |
| message | text | yes |
| honeypot | text | yes |
| ip_hash | text | yes |
| stage | text | yes |
| job_value_usd | text | yes |

## raw.disposable_domains

Public disposable e-mail domain list (CC0).

| Column | Type | Nullable |
|---|---|---|
| domain | text | no |

## raw.ga4_events_daily

GA4 generate_lead events per property day.

| Column | Type | Nullable |
|---|---|---|
| date | text | yes |
| property | text | yes |
| event_name | text | yes |
| event_count | text | yes |

## raw.google_ads_daily

Google Ads campaign report: day in the account time zone, conversions by click date and by conversion date.

| Column | Type | Nullable |
|---|---|---|
| date | text | yes |
| account | text | yes |
| campaign | text | yes |
| impressions | text | yes |
| clicks | text | yes |
| cost | text | yes |
| conversions | text | yes |
| conversions_by_conv_time | text | yes |

## raw.lsa_leads

Local Services Ads lead report: charged, disputed and credited leads.

| Column | Type | Nullable |
|---|---|---|
| lsa_lead_id | text | yes |
| account | text | yes |
| lead_date | text | yes |
| lead_type | text | yes |
| consumer_phone | text | yes |
| charged | text | yes |
| charge_usd | text | yes |
| dispute_status | text | yes |
| credit_usd | text | yes |

## raw.manual_calls_sheet

Call log typed by office staff (Google Sheet).

| Column | Type | Nullable |
|---|---|---|
| call_date | text | yes |
| brand | text | yes |
| caller_phone | text | yes |
| source | text | yes |
| booked | text | yes |
| entered_by | text | yes |

## raw.message_scores

Text spam probability per form message (classifier trained on PUBLIC SMS data).

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | yes |
| text_spam_prob | text | yes |

## raw.meta_ads_daily

Meta Ads report: leads as Meta counts them (Pixel + CAPI).

| Column | Type | Nullable |
|---|---|---|
| date | text | yes |
| account | text | yes |
| campaign | text | yes |
| amount_spent | text | yes |
| impressions | text | yes |
| link_clicks | text | yes |
| leads | text | yes |
| pixel_leads | text | yes |
| capi_leads | text | yes |

## raw.weather_daily

Daily weather per city (Open-Meteo, PUBLIC DATA).

| Column | Type | Nullable |
|---|---|---|
| date | text | yes |
| tmax | text | yes |
| tmin | text | yes |
| precip | text | yes |
| brand | text | yes |

## raw.webhook_events

Form webhooks as JSON; dedup_key unique, so retries are stored once.

| Column | Type | Nullable |
|---|---|---|
| id | bigint | no |
| received_at | timestamp with time zone | no |
| source | text | no |
| dedup_key | text | no |
| payload | jsonb | no |

## staging.phone_norm

One row per distinct raw phone string, normalized with libphonenumber.

| Column | Type | Nullable |
|---|---|---|
| phone_raw | text | no |
| phone_e164 | text | yes |
| phone_country | text | yes |
| phone_valid | boolean | yes |

## core.brand_access

RLS example: which user may read which brand.

| Column | Type | Nullable |
|---|---|---|
| user_id | uuid | no |
| brand | text | no |

## core.brands

The five fictional brands.

| Column | Type | Nullable |
|---|---|---|
| brand | text | no |
| trade | text | yes |
| city | text | yes |
| tz | text | no |
| county | text | yes |
| population_2025 | integer | yes |

## core.calls_sheet

Call sheet with normalized source labels.

| Column | Type | Nullable |
|---|---|---|
| row_id | integer | no |
| brand | text | yes |
| call_date | date | yes |
| phone_e164 | text | yes |
| source_raw | text | yes |
| source_std | text | yes |
| is_standard | boolean | yes |
| booked | boolean | yes |

## core.channel_map_scd2

Versioned CRM-label → channel map (SCD type 2).

| Column | Type | Nullable |
|---|---|---|
| map_id | integer | no |
| source_label | text | no |
| match_type | text | no |
| channel | text | no |
| priority | integer | no |
| version | integer | no |
| valid_from | date | no |
| valid_to | date | yes |
| change_note | text | yes |

## core.channels

Controlled channel list (fixed order, fixed colours).

| Column | Type | Nullable |
|---|---|---|
| channel | text | no |
| label | text | no |
| is_paid | boolean | no |
| sort | integer | no |

## core.contacts

One row per person (a lead and its duplicates).

| Column | Type | Nullable |
|---|---|---|
| contact_id | text | no |
| brand | text | yes |
| first_lead_id | text | yes |
| phone_e164 | text | yes |
| email_norm | text | yes |
| lead_count | integer | yes |

## core.ga4_daily

GA4 generate_lead per brand and day.

| Column | Type | Nullable |
|---|---|---|
| brand | text | no |
| date | date | no |
| generate_lead | integer | yes |

## core.leads

One row per CRM record, typed and normalized.

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | no |
| brand | text | no |
| created_at | timestamp with time zone | no |
| local_date | date | no |
| utc_date | date | no |
| lead_type | text | no |
| form_id | text | yes |
| attribution_source | text | yes |
| utm_source | text | yes |
| utm_medium | text | yes |
| utm_campaign | text | yes |
| gclid | text | yes |
| fbclid | text | yes |
| landing_page | text | yes |
| referrer | text | yes |
| phone_raw | text | yes |
| phone_e164 | text | yes |
| phone_country | text | yes |
| phone_valid | boolean | yes |
| email_raw | text | yes |
| email_norm | text | yes |
| email_domain | text | yes |
| message | text | yes |
| honeypot | text | yes |
| ip_hash | text | yes |
| stage | text | yes |
| job_value_usd | numeric | yes |

## core.spend_daily

Spend and platform-reported leads per brand, day and paid channel (LSA net of credits).

| Column | Type | Nullable |
|---|---|---|
| brand | text | no |
| date | date | no |
| channel | text | no |
| gross_cost | numeric | yes |
| credits | numeric | yes |
| net_cost | numeric | yes |
| clicks | integer | yes |
| impressions | integer | yes |
| platform_leads | integer | yes |
| platform_leads_conv_time | integer | yes |

## core.touches

Attribution evidence and result per lead.

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | no |
| raw_channel | text | yes |
| corrected_channel | text | yes |
| rule | text | yes |
| confidence | text | yes |
| map_version | integer | yes |

## core.weather_daily

Typed weather per brand and day.

| Column | Type | Nullable |
|---|---|---|
| brand | text | no |
| date | date | no |
| tmax | numeric | yes |
| tmin | numeric | yes |
| precip | numeric | yes |

## audit.check_results

One result per check, brand and day.

| Column | Type | Nullable |
|---|---|---|
| check_id | text | no |
| brand | text | no |
| date | date | no |
| observed | numeric | yes |
| status | text | yes |
| note | text | yes |

## audit.checks

Automated check definitions and runbook links.

| Column | Type | Nullable |
|---|---|---|
| check_id | text | no |
| name | text | no |
| rule | text | no |
| threshold | text | no |
| window_days | integer | no |
| runbook | text | yes |

## audit.incidents

Incident log (symptom, cause, evidence, impact, fix, status).

| Column | Type | Nullable |
|---|---|---|
| incident_no | integer | no |
| title | text | yes |
| brand | text | yes |
| start_date | date | yes |
| end_date | date | yes |
| kind | text | yes |
| symptom | text | yes |
| root_cause | text | yes |
| evidence | text | yes |
| impact | text | yes |
| fix | text | yes |
| status | text | yes |

## audit.kpi_snapshots

Monthly KPI values frozen at month close.

| Column | Type | Nullable |
|---|---|---|
| month | date | no |
| brand | text | no |
| channel | text | no |
| metric | text | no |
| value | numeric | yes |
| map_version | integer | yes |
| snapshot_at | timestamp with time zone | no |

## audit.lead_flags

One row per lead and rule that fired, with a readable reason.

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | no |
| rule_id | text | no |
| rule_version | integer | no |
| flag_type | text | no |
| score | numeric | yes |
| reason | text | no |
| related_lead_id | text | yes |
| flagged_at | timestamp with time zone | no |

## audit.lead_status

Final verdict per lead (spam > duplicate > invalid > valid).

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | no |
| status | text | no |
| spam_score | numeric | no |
| duplicate_of | text | yes |
| reasons | ARRAY | no |

## audit.rules

Audit rule registry (id, version, weight, description).

| Column | Type | Nullable |
|---|---|---|
| rule_id | text | no |
| version | integer | no |
| flag_type | text | no |
| weight | numeric | yes |
| description | text | no |

## marts.attribution_health

View: monthly UTM / GCLID coverage and re-attribution.

| Column | Type | Nullable |
|---|---|---|
| brand | text | yes |
| month | date | yes |
| leads | bigint | yes |
| paid_search_with_utm | bigint | yes |
| paid_search_with_gclid | bigint | yes |
| paid_landing_without_utm | bigint | yes |
| reattributed | bigint | yes |
| inferred | bigint | yes |

## marts.history_check

View: snapshot vs SCD2 recompute vs naive recompute.

| Column | Type | Nullable |
|---|---|---|
| month | date | yes |
| brand | text | yes |
| channel | text | yes |
| snapshot | numeric | yes |
| recomputed_scd2 | bigint | yes |
| recomputed_naive | bigint | yes |

## marts.kpi_daily_brand

View: daily KPIs per brand and corrected channel (local day).

| Column | Type | Nullable |
|---|---|---|
| date | date | yes |
| brand | text | yes |
| channel | text | yes |
| submissions | bigint | yes |
| leads | bigint | yes |
| qualified | bigint | yes |
| spam | bigint | yes |
| duplicates | bigint | yes |
| invalid | bigint | yes |
| booked | bigint | yes |
| revenue | numeric | yes |
| spend_gross | numeric | yes |
| credits | numeric | yes |
| spend | numeric | yes |
| platform_leads | integer | yes |

## marts.lead_facts

View: one row per lead with verdict and attribution.

| Column | Type | Nullable |
|---|---|---|
| lead_id | text | yes |
| brand | text | yes |
| created_at | timestamp with time zone | yes |
| local_date | date | yes |
| utc_date | date | yes |
| lead_type | text | yes |
| form_id | text | yes |
| attribution_source | text | yes |
| utm_source | text | yes |
| utm_medium | text | yes |
| utm_campaign | text | yes |
| gclid | text | yes |
| fbclid | text | yes |
| landing_page | text | yes |
| referrer | text | yes |
| phone_raw | text | yes |
| phone_e164 | text | yes |
| phone_country | text | yes |
| phone_valid | boolean | yes |
| email_raw | text | yes |
| email_norm | text | yes |
| email_domain | text | yes |
| message | text | yes |
| honeypot | text | yes |
| ip_hash | text | yes |
| stage | text | yes |
| job_value_usd | numeric | yes |
| status | text | yes |
| spam_score | numeric | yes |
| duplicate_of | text | yes |
| reasons | ARRAY | yes |
| raw_channel | text | yes |
| corrected_channel | text | yes |
| attribution_rule | text | yes |
| confidence | text | yes |
| map_version | integer | yes |

## marts.monthly_label_kpis

View: monthly leads per CRM-label channel (SCD2 mapping).

| Column | Type | Nullable |
|---|---|---|
| month | date | yes |
| brand | text | yes |
| channel | text | yes |
| leads | bigint | yes |
| map_version | integer | yes |

## marts.monthly_label_kpis_naive

View: the same with today's mapping applied to all history (what the old pipeline did).

| Column | Type | Nullable |
|---|---|---|
| month | date | yes |
| brand | text | yes |
| channel | text | yes |
| leads | bigint | yes |

## marts.recon_cascade

View: Google Ads → CRM cascade per brand and month.

| Column | Type | Nullable |
|---|---|---|
| brand | text | yes |
| month | date | yes |
| platform_click_date | bigint | yes |
| step_conversion_date | bigint | yes |
| step_not_tracked_or_extra | bigint | yes |
| step_duplicates | bigint | yes |
| step_spam_invalid | bigint | yes |
| step_time_zone | bigint | yes |
| crm_report | bigint | yes |

## marts.reconciliation_daily

View: platform vs CRM per system, brand and day (local and UTC).

| Column | Type | Nullable |
|---|---|---|
| system | text | yes |
| brand | text | yes |
| date | date | yes |
| platform_value | bigint | yes |
| crm_value | bigint | yes |
| crm_value_utc | bigint | yes |
| diff | bigint | yes |
