# Looker Studio view

*No Google account was used: this is the ready-to-connect file and the report recipe.*

## Data source
1. Import `exports/looker_studio/kpi_daily_brand.csv` into a Google Sheet (one tab), or in production point Looker Studio at the Supabase PostgreSQL connector on `marts.kpi_daily_brand`.
2. In Looker Studio: *Add data → Google Sheets* → the tab. Set `date` as Date, `brand` and `channel` as Text, the rest as Number.

Grain: one row per local day × brand × corrected channel. Columns: submissions, leads, qualified, spam, duplicates, invalid, booked, spend_net, spend_gross, lsa_credits, platform_leads.

## Calculated fields

| Field | Formula |
|---|---|
| Is paid | `CASE WHEN channel IN ("google_ads", "lsa", "meta") THEN TRUE ELSE FALSE END` |
| Paid qualified | `CASE WHEN channel IN ("google_ads", "lsa", "meta") THEN qualified ELSE 0 END` |
| CPQL | `SUM(spend_net) / SUM(Paid qualified)` |
| Noise share | `(SUM(submissions) - SUM(qualified)) / SUM(submissions)` |
| Booking rate | `SUM(booked) / SUM(qualified)` |
| Brand label | `REPLACE(brand, "-", "·")` |

## Report (one page, same layout as the dashboard Overview)
- Controls: date range (default: last 90 days), brand drop-down, channel drop-down.
- Scorecards: Leads, Qualified leads, Spend (net), CPQL, Noise share.
- Time series: qualified leads per week, broken down by brand (small multiples via one chart per brand, or a filter).
- Bar chart: CPQL by channel, sorted.
- Table: brand × channel with Qualified, Spend, CPQL (heatmap on CPQL).
- Channel colours: Google Ads `#2a78d6`, LSA `#e34948`, Meta `#008300`, GBP `#e87ba4`, Organic `#eda100`, Direct `#6250d6`, Referral `#1baf7a` (same as the dashboard; validated for colour-blind separation with direct labels).
