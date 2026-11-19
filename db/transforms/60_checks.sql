-- 60_checks.sql : automated data-quality checks, one result per brand and day.
-- Each check looks at a trailing window so small daily counts do not cause false alarms.
-- Status: pass | warn | fail | explained (anomaly with a documented real-world cause) | n/a (too little data)

TRUNCATE audit.checks CASCADE;
INSERT INTO audit.checks VALUES
 ('CHK01', 'GCLID coverage', 'Paid-search leads with UTM that also carry a gclid', '>= 80%', 14, 'Check the form hidden field and the GCLID capture script (RUNBOOK #gclid)'),
 ('CHK02', 'Paid landing pages without UTM', 'Leads on /lp/ or /offer/ pages that arrived without UTM', '<= 5%', 7, 'Test redirects and query-string forwarding on landing pages (RUNBOOK #utm)'),
 ('CHK03', 'Meta vs CRM', 'Meta-reported leads / CRM Meta leads', '0.75 - 1.30', 28, 'Check Pixel/CAPI deduplication: shared event_id and event_name (RUNBOOK #capi)'),
 ('CHK04', 'GA4 vs CRM', 'GA4 generate_lead / CRM web-form submissions', '0.80 - 1.08', 14, 'Check the GTM trigger fires once per submission (RUNBOOK #ga4)'),
 ('CHK05', 'Google Ads vs CRM', 'Google Ads conversions (conversion date) / CRM Google Ads forms', '0.85 - 1.15', 14, 'Compare by conversion date in the account time zone first (RUNBOOK #gads)'),
 ('CHK06', 'LSA vs CRM', 'LSA platform leads / CRM LSA leads', '0.90 - 1.10', 14, 'Check the LSA -> CRM integration and the channel map (RUNBOOK #lsa)'),
 ('CHK07', 'Spam share', 'Submissions flagged as spam', '<= 10%', 14, 'Review the flagged queue; tighten form protection (RUNBOOK #spam)'),
 ('CHK08', 'Duplicate share', 'Submissions flagged as duplicates', '<= 22%', 14, 'Look for double-firing forms or call + form overlap (RUNBOOK #dup)'),
 ('CHK09', 'Call-sheet labels', 'Manual call-sheet rows using a standard source label', '>= 98%', 30, 'Normalize labels; add a dropdown to the sheet (RUNBOOK #sheet)'),
 ('CHK10', 'Lead volume', 'Last 7 days of qualified leads vs the 4 weeks before', 'ratio < 1.7', 35, 'Rule out tracking first (spam, duplicates, tags); then look for a real cause (RUNBOOK #volume)'),
 ('CHK11', 'Closed months unchanged', 'Monthly KPI snapshots vs recomputation', '0 changes', 0, 'Never edit mappings in place; add a new SCD2 version (RUNBOOK #history)');

CREATE TEMP TABLE IF NOT EXISTS chk_day AS SELECT 1 AS x LIMIT 0;
DROP TABLE chk_day;
CREATE TEMP TABLE chk_day AS
WITH grid AS (
  SELECT b.brand, d::date AS date FROM core.brands b
  CROSS JOIN generate_series(DATE '2025-05-01', DATE '2026-10-31', interval '1 day') d
),
f AS (
  SELECT brand, local_date AS date,
    count(*) AS sub,
    count(*) FILTER (WHERE status = 'spam') AS spam,
    count(*) FILTER (WHERE status = 'duplicate') AS dup,
    count(*) FILTER (WHERE status = 'valid') AS qual,
    count(*) FILTER (WHERE status <> 'spam' AND utm_medium = 'cpc') AS cpc_utm,
    count(*) FILTER (WHERE status <> 'spam' AND utm_medium = 'cpc' AND gclid IS NOT NULL) AS cpc_gclid,
    count(*) FILTER (WHERE status <> 'spam' AND lead_type = 'form' AND (landing_page LIKE '/lp/%' OR landing_page LIKE '/offer/%')) AS lp,
    count(*) FILTER (WHERE status <> 'spam' AND lead_type = 'form' AND (landing_page LIKE '/lp/%' OR landing_page LIKE '/offer/%') AND utm_source IS NULL) AS lp_no_utm
  FROM marts.lead_facts GROUP BY 1, 2
),
r AS (
  SELECT brand, date,
    sum(platform_value) FILTER (WHERE system = 'meta') AS meta_p, sum(crm_value) FILTER (WHERE system = 'meta') AS meta_c,
    sum(platform_value) FILTER (WHERE system = 'ga4') AS ga4_p, sum(crm_value) FILTER (WHERE system = 'ga4') AS ga4_c,
    sum(platform_value) FILTER (WHERE system = 'google_ads') AS gads_p, sum(crm_value) FILTER (WHERE system = 'google_ads') AS gads_c,
    sum(platform_value) FILTER (WHERE system = 'lsa') AS lsa_p, sum(crm_value) FILTER (WHERE system = 'lsa') AS lsa_c
  FROM marts.reconciliation_daily GROUP BY 1, 2
),
s AS (SELECT brand, call_date AS date, count(*) AS rows_, count(*) FILTER (WHERE is_standard) AS std FROM core.calls_sheet GROUP BY 1, 2),
p95 AS (SELECT brand, percentile_cont(0.95) WITHIN GROUP (ORDER BY tmax) AS tmax95,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY precip) AS precip95,
               percentile_cont(0.03) WITHIN GROUP (ORDER BY tmin) AS tmin03 FROM core.weather_daily GROUP BY 1),
w AS (  -- extreme weather day: among the brand's hottest / wettest 5% or coldest 3% of days
  SELECT wd.brand, wd.date, wd.tmax, wd.precip, (wd.tmax >= p95.tmax95 OR wd.precip >= greatest(p95.precip95, 10) OR wd.tmin <= least(p95.tmin03, 0)) AS extreme
  FROM core.weather_daily wd JOIN p95 USING (brand)
)
SELECT g.brand, g.date,
  coalesce(f.sub, 0) AS sub, coalesce(f.spam, 0) AS spam, coalesce(f.dup, 0) AS dup, coalesce(f.qual, 0) AS qual,
  coalesce(f.cpc_utm, 0) AS cpc_utm, coalesce(f.cpc_gclid, 0) AS cpc_gclid, coalesce(f.lp, 0) AS lp, coalesce(f.lp_no_utm, 0) AS lp_no_utm,
  coalesce(r.meta_p, 0) AS meta_p, coalesce(r.meta_c, 0) AS meta_c, coalesce(r.ga4_p, 0) AS ga4_p, coalesce(r.ga4_c, 0) AS ga4_c,
  coalesce(r.gads_p, 0) AS gads_p, coalesce(r.gads_c, 0) AS gads_c, coalesce(r.lsa_p, 0) AS lsa_p, coalesce(r.lsa_c, 0) AS lsa_c,
  coalesce(s.rows_, 0) AS sheet_rows, coalesce(s.std, 0) AS sheet_std, w.tmax, w.precip, w.extreme
FROM grid g LEFT JOIN f USING (brand, date) LEFT JOIN r USING (brand, date) LEFT JOIN s USING (brand, date) LEFT JOIN w USING (brand, date);

-- Trailing sums (window = n days ending on the day).
CREATE TEMP TABLE IF NOT EXISTS chk_roll AS SELECT 1 AS x LIMIT 0;
DROP TABLE chk_roll;
CREATE TEMP TABLE chk_roll AS
SELECT brand, date, sub, tmax, precip, extreme,
  sum(cpc_gclid) OVER w14 AS cpc_gclid7, sum(cpc_utm) OVER w14 AS cpc_utm7,
  sum(lp_no_utm) OVER w7 AS lp_no_utm7, sum(lp) OVER w7 AS lp7,
  sum(meta_p) OVER w28 AS meta_p28, sum(meta_c) OVER w28 AS meta_c28,
  sum(ga4_p) OVER w14 AS ga4_p14, sum(ga4_c) OVER w14 AS ga4_c14,
  sum(gads_p) OVER w14 AS gads_p14, sum(gads_c) OVER w14 AS gads_c14,
  sum(lsa_p) OVER w14 AS lsa_p14, sum(lsa_c) OVER w14 AS lsa_c14,
  sum(spam) OVER w14 AS spam7, sum(dup) OVER w14 AS dup7, sum(sub) OVER w14 AS sub7,
  sum(qual) OVER w7 AS qual7, avg(qual) OVER base AS qual_base,
  sum(sheet_std) OVER w30 AS sheet_std30, sum(sheet_rows) OVER w30 AS sheet_rows30,
  avg(sub) OVER prev28 AS sub_mean28, stddev_samp(sub) OVER prev28 AS sub_sd28
FROM chk_day
WINDOW w7 AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),
       w14 AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW),
       w28 AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW),
       w30 AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW),
       prev28 AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING),
       base AS (PARTITION BY brand ORDER BY date ROWS BETWEEN 34 PRECEDING AND 7 PRECEDING);

-- Helper: status of a ratio against a tolerance band ("n/a" when the denominator is too small).
CREATE OR REPLACE FUNCTION audit.band(num numeric, den numeric, lo numeric, hi numeric, min_den numeric, bad text DEFAULT 'fail')
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(den, 0) < min_den THEN 'n/a'
              WHEN num / den BETWEEN lo AND hi THEN 'pass' ELSE bad END
$$;

INSERT INTO audit.check_results (check_id, brand, date, observed, status, note)
SELECT 'CHK01', brand, date, round(cpc_gclid7 / nullif(cpc_utm7, 0), 4), audit.band(cpc_gclid7, cpc_utm7, 0.80, 1, 20), NULL FROM chk_roll
UNION ALL
SELECT 'CHK02', brand, date, round(lp_no_utm7 / nullif(lp7, 0), 4), audit.band(lp_no_utm7, lp7, 0, 0.05, 5), NULL FROM chk_roll
UNION ALL
SELECT 'CHK03', brand, date, round(meta_p28 / nullif(meta_c28, 0), 4), audit.band(meta_p28, meta_c28, 0.75, 1.30, 10), NULL FROM chk_roll
UNION ALL
SELECT 'CHK04', brand, date, round(ga4_p14 / nullif(ga4_c14, 0), 4), audit.band(ga4_p14, ga4_c14, 0.80, 1.08, 20), NULL FROM chk_roll
UNION ALL
SELECT 'CHK05', brand, date, round(gads_p14 / nullif(gads_c14, 0), 4), audit.band(gads_p14, gads_c14, 0.85, 1.15, 10), NULL FROM chk_roll
UNION ALL
SELECT 'CHK06', brand, date, round(lsa_p14 / nullif(lsa_c14, 0), 4), audit.band(lsa_p14, lsa_c14, 0.90, 1.10, 10), NULL FROM chk_roll
UNION ALL
SELECT 'CHK07', brand, date, round(spam7 / nullif(sub7, 0), 4), audit.band(spam7, sub7, 0, 0.10, 20), NULL FROM chk_roll
UNION ALL
SELECT 'CHK08', brand, date, round(dup7 / nullif(sub7, 0), 4), audit.band(dup7, sub7, 0, 0.22, 20, 'warn'), NULL FROM chk_roll
UNION ALL
SELECT 'CHK09', brand, date, round(sheet_std30 / nullif(sheet_rows30, 0), 4), audit.band(sheet_std30, sheet_rows30, 0.98, 1, 20, 'warn'), NULL FROM chk_roll;

-- CHK10: volume spike = last 7 days of qualified leads >= 1.7x the daily average of the 4 weeks before.
-- A spike is "explained" only when the quality checks pass (no spam wave, no duplicate burst)
-- AND the week had extreme weather: real demand, not a tracking bug. It is then NOT corrected.
INSERT INTO audit.check_results (check_id, brand, date, observed, status, note)
SELECT 'CHK10', r.brand, r.date, round(ratio, 2),
  CASE WHEN r.qual_base IS NULL OR r.qual_base < 1 THEN 'n/a'
       WHEN ratio < 1.7 THEN 'pass'
       WHEN wx.extreme_days > 0 AND spam.status = 'pass' AND dup.status IN ('pass', 'n/a') THEN 'explained'
       ELSE 'warn' END,
  CASE WHEN ratio >= 1.7 AND wx.extreme_days > 0 AND spam.status = 'pass'
       THEN 'demand spike in a week with ' || wx.extreme_days || ' extreme-weather day(s) (max ' || round(wx.tmax_max) || ' C); spam and duplicate checks pass' END
FROM (SELECT *, qual7 / nullif(qual_base * 7, 0) AS ratio FROM chk_roll) r
JOIN LATERAL (SELECT count(*) FILTER (WHERE d.extreme) AS extreme_days, max(d.tmax) AS tmax_max FROM chk_day d
              WHERE d.brand = r.brand AND d.date BETWEEN r.date - 6 AND r.date) wx ON true
JOIN audit.check_results spam ON spam.check_id = 'CHK07' AND spam.brand = r.brand AND spam.date = r.date
JOIN audit.check_results dup ON dup.check_id = 'CHK08' AND dup.brand = r.brand AND dup.date = r.date;

-- Warm-up: the first 5 weeks have no full trailing window, so they are not judged.
UPDATE audit.check_results SET status = 'n/a', note = 'warm-up period (no full window yet)'
WHERE date < DATE '2025-06-05' AND check_id <> 'CHK11';
