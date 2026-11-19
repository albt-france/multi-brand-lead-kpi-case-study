-- 005_marts.sql
-- Views the dashboard and Looker Studio read. No business logic is hidden in the front end:
-- every number on screen comes from one of these views.

-- One row per lead with its audit verdict and attribution.
CREATE OR REPLACE VIEW marts.lead_facts AS
SELECT l.*, s.status, s.spam_score, s.duplicate_of, s.reasons,
       t.raw_channel, t.corrected_channel, t.rule AS attribution_rule, t.confidence, t.map_version
FROM core.leads l
JOIN audit.lead_status s USING (lead_id)
JOIN core.touches t USING (lead_id);

-- Daily KPIs per brand and (corrected) channel, in the brand's local day.
--   submissions = every CRM record; leads = without duplicates; qualified = valid only
CREATE OR REPLACE VIEW marts.kpi_daily_brand AS
WITH l AS (
  SELECT local_date AS date, brand, corrected_channel AS channel,
         count(*) AS submissions,
         count(*) FILTER (WHERE status <> 'duplicate') AS leads,
         count(*) FILTER (WHERE status = 'valid') AS qualified,
         count(*) FILTER (WHERE status = 'spam') AS spam,
         count(*) FILTER (WHERE status = 'duplicate') AS duplicates,
         count(*) FILTER (WHERE status = 'invalid') AS invalid,
         count(*) FILTER (WHERE status = 'valid' AND stage IN ('Booked', 'Won')) AS booked,
         coalesce(sum(job_value_usd) FILTER (WHERE status = 'valid'), 0) AS revenue
  FROM marts.lead_facts GROUP BY 1, 2, 3
)
SELECT coalesce(l.date, s.date) AS date, coalesce(l.brand, s.brand) AS brand, coalesce(l.channel, s.channel) AS channel,
       coalesce(submissions, 0) AS submissions, coalesce(leads, 0) AS leads, coalesce(qualified, 0) AS qualified,
       coalesce(spam, 0) AS spam, coalesce(duplicates, 0) AS duplicates, coalesce(invalid, 0) AS invalid,
       coalesce(booked, 0) AS booked, coalesce(revenue, 0) AS revenue,
       coalesce(s.gross_cost, 0) AS spend_gross, coalesce(s.credits, 0) AS credits, coalesce(s.net_cost, 0) AS spend,
       coalesce(s.platform_leads, 0) AS platform_leads
FROM l FULL JOIN core.spend_daily s ON s.brand = l.brand AND s.date = l.date AND s.channel = l.channel;

-- Daily platform-vs-CRM comparison for each system. crm_value uses the brand's local day,
-- crm_value_utc the UTC day (the naive comparison that creates false daily gaps).
CREATE OR REPLACE VIEW marts.reconciliation_daily AS
WITH f AS (SELECT * FROM marts.lead_facts),
crm AS (
  SELECT 'google_ads' AS system, brand, local_date, utc_date, 1 AS n FROM f
   WHERE corrected_channel = 'google_ads' AND lead_type = 'form'                 -- the tag fires on every submission
  UNION ALL
  SELECT 'meta', brand, local_date, utc_date, 1 FROM f
   WHERE corrected_channel = 'meta' AND status NOT IN ('duplicate', 'spam')
  UNION ALL
  SELECT 'lsa', brand, local_date, utc_date, 1 FROM f
   WHERE corrected_channel = 'lsa' AND status <> 'duplicate'
  UNION ALL
  SELECT 'ga4', brand, local_date, utc_date, 1 FROM f
   WHERE lead_type = 'form' AND corrected_channel <> 'lsa' AND attribution_source IS DISTINCT FROM 'Facebook Lead Ad'
     AND status <> 'spam'                                                         -- bots rarely run analytics tags
  UNION ALL
  SELECT 'call_sheet', brand, local_date, utc_date, 1 FROM f
   WHERE lead_type = 'call' AND corrected_channel <> 'lsa' AND status <> 'spam'
),
crm_local AS (SELECT system, brand, local_date AS date, sum(n) AS crm_value FROM crm GROUP BY 1, 2, 3),
crm_utc AS (SELECT system, brand, utc_date AS date, sum(n) AS crm_value_utc FROM crm GROUP BY 1, 2, 3),
platform AS (
  SELECT 'google_ads' AS system, brand, date, platform_leads_conv_time AS platform_value FROM core.spend_daily WHERE channel = 'google_ads'
  UNION ALL SELECT 'meta', brand, date, platform_leads FROM core.spend_daily WHERE channel = 'meta'
  UNION ALL SELECT 'lsa', brand, date, platform_leads FROM core.spend_daily WHERE channel = 'lsa'
  UNION ALL SELECT 'ga4', brand, date, generate_lead FROM core.ga4_daily
  UNION ALL SELECT 'call_sheet', brand, call_date, count(*) FROM core.calls_sheet GROUP BY brand, call_date
)
SELECT p.system, p.brand, p.date, p.platform_value,
       coalesce(c.crm_value, 0) AS crm_value, coalesce(u.crm_value_utc, 0) AS crm_value_utc,
       p.platform_value - coalesce(c.crm_value, 0) AS diff
FROM platform p
LEFT JOIN crm_local c USING (system, brand, date)
LEFT JOIN crm_utc u USING (system, brand, date);

-- Google Ads reconciliation cascade per brand and month:
-- platform (click date) -> by conversion date -> not in CRM -> duplicates -> spam/invalid -> UTC day = CRM report
CREATE OR REPLACE VIEW marts.recon_cascade AS
WITH p AS (
  SELECT brand, date_trunc('month', date)::date AS month,
         sum(platform_leads) AS platform_click_date, sum(platform_leads_conv_time) AS platform_conv_date
  FROM core.spend_daily WHERE channel = 'google_ads' GROUP BY 1, 2
),
c AS (
  SELECT brand, date_trunc('month', local_date)::date AS month,
         count(*) AS crm_submissions,
         count(*) FILTER (WHERE status <> 'duplicate') AS crm_unique,
         count(*) FILTER (WHERE status = 'valid') AS crm_qualified_local
  FROM marts.lead_facts WHERE corrected_channel = 'google_ads' AND lead_type = 'form' GROUP BY 1, 2
),
u AS (
  SELECT brand, date_trunc('month', utc_date)::date AS month, count(*) AS crm_qualified_utc
  FROM marts.lead_facts WHERE corrected_channel = 'google_ads' AND lead_type = 'form' AND status = 'valid' GROUP BY 1, 2
)
SELECT p.brand, p.month, p.platform_click_date,
       p.platform_conv_date - p.platform_click_date AS step_conversion_date,
       c.crm_submissions - p.platform_conv_date AS step_not_tracked_or_extra,
       c.crm_unique - c.crm_submissions AS step_duplicates,
       c.crm_qualified_local - c.crm_unique AS step_spam_invalid,
       u.crm_qualified_utc - c.crm_qualified_local AS step_time_zone,
       u.crm_qualified_utc AS crm_report
FROM p JOIN c USING (brand, month) JOIN u USING (brand, month);

-- Monthly attribution health per brand.
CREATE OR REPLACE VIEW marts.attribution_health AS
SELECT brand, date_trunc('month', local_date)::date AS month,
       count(*) FILTER (WHERE status <> 'spam') AS leads,
       count(*) FILTER (WHERE status <> 'spam' AND utm_medium = 'cpc') AS paid_search_with_utm,
       count(*) FILTER (WHERE status <> 'spam' AND utm_medium = 'cpc' AND gclid IS NOT NULL) AS paid_search_with_gclid,
       count(*) FILTER (WHERE status <> 'spam' AND lead_type = 'form'
                          AND (landing_page LIKE '/lp/%' OR landing_page LIKE '/offer/%') AND utm_source IS NULL) AS paid_landing_without_utm,
       count(*) FILTER (WHERE status <> 'spam' AND raw_channel IS DISTINCT FROM corrected_channel) AS reattributed,
       count(*) FILTER (WHERE status <> 'spam' AND confidence = 'Inferred') AS inferred
FROM marts.lead_facts GROUP BY 1, 2;
