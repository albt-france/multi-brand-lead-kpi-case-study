-- 10_core.sql : raw (text) -> core (typed, normalized). Re-runnable: each table is rebuilt.

TRUNCATE core.brands, core.weather_daily, core.leads, core.spend_daily, core.calls_sheet, core.ga4_daily CASCADE;

INSERT INTO core.brands
SELECT brand, trade, city, tz, county, population_2025::int FROM raw.brands;

INSERT INTO core.weather_daily
SELECT brand, date::date, tmax::numeric, tmin::numeric, precip::numeric FROM raw.weather_daily;

-- Leads: typed timestamps, local and UTC calendar days, normalized phone and e-mail.
INSERT INTO core.leads
SELECT r.lead_id, r.brand,
       r.created_at_utc::timestamptz,
       (r.created_at_utc::timestamptz AT TIME ZONE b.tz)::date,   -- day in the brand's time zone
       (r.created_at_utc::timestamptz AT TIME ZONE 'UTC')::date,   -- day in UTC
       r.lead_type, nullif(r.form_id, ''), nullif(r.attribution_source, ''),
       nullif(r.utm_source, ''), nullif(r.utm_medium, ''), nullif(r.utm_campaign, ''),
       nullif(r.gclid, ''), nullif(r.fbclid, ''), nullif(r.landing_page, ''), nullif(r.referrer, ''),
       nullif(r.phone, ''), p.phone_e164, p.phone_country, p.phone_valid,
       nullif(r.email, ''), lower(trim(nullif(r.email, ''))), split_part(lower(trim(nullif(r.email, ''))), '@', 2),
       nullif(r.message, ''), nullif(r.honeypot, ''), r.ip_hash,
       r.stage, nullif(r.job_value_usd, '')::numeric
FROM raw.crm_contacts r
JOIN core.brands b USING (brand)
LEFT JOIN staging.phone_norm p ON p.phone_raw = r.phone;

-- Spend and platform-reported leads, one row per brand, day and paid channel.
INSERT INTO core.spend_daily
SELECT account, date::date, 'google_ads', cost::numeric, 0, cost::numeric, clicks::int, impressions::int,
       conversions::int, conversions_by_conv_time::int
FROM raw.google_ads_daily;

INSERT INTO core.spend_daily
SELECT account, date::date, 'meta', amount_spent::numeric, 0, amount_spent::numeric, link_clicks::int,
       impressions::int, leads::int, leads::int
FROM raw.meta_ads_daily;

-- LSA: the platform's cost is GROSS (charged leads). Approved disputes are credited back,
-- so the real cost is gross minus credits (incident 8).
INSERT INTO core.spend_daily
SELECT account, lead_date::date, 'lsa', sum(charge_usd::numeric), sum(credit_usd::numeric),
       sum(charge_usd::numeric) - sum(credit_usd::numeric), NULL, NULL, count(*), count(*)
FROM raw.lsa_leads GROUP BY account, lead_date::date;

INSERT INTO core.ga4_daily
SELECT property, date::date, sum(event_count::int) FROM raw.ga4_events_daily
WHERE event_name = 'generate_lead' GROUP BY 1, 2;

-- Manual call sheet: dates typed as MM/DD/YYYY, source typed freely (incident 9).
-- The label is cleaned (case, spaces, dashes) and mapped to the controlled channel list.
INSERT INTO core.calls_sheet (brand, call_date, phone_e164, source_raw, source_std, is_standard, booked)
SELECT s.brand, to_date(s.call_date, 'MM/DD/YYYY'), p.phone_e164, s.source,
       CASE regexp_replace(lower(trim(s.source)), '[\s_-]+', ' ', 'g')
         WHEN 'gbp call' THEN 'gbp' WHEN 'gbp' THEN 'gbp' WHEN 'google maps' THEN 'gbp'
         WHEN 'organic' THEN 'seo' WHEN 'seo' THEN 'seo' WHEN 'google search' THEN 'seo'
         WHEN 'direct' THEN 'direct' WHEN 'drive by' THEN 'direct'
         WHEN 'referral' THEN 'referral' WHEN 'referal' THEN 'referral' WHEN 'neighbor referral' THEN 'referral'
         WHEN 'google ads' THEN 'google_ads' WHEN 'adwords' THEN 'google_ads'
         WHEN 'facebook' THEN 'meta' WHEN 'fb' THEN 'meta' WHEN 'facebook ads' THEN 'meta'
       END,
       s.source IN ('GBP Call', 'Organic', 'Direct', 'Referral', 'Google Ads', 'Facebook'),
       s.booked = 'Y'
FROM raw.manual_calls_sheet s
LEFT JOIN staging.phone_norm p ON p.phone_raw = s.caller_phone;

-- Versioned channel map (SCD type 2). v2 added a catch-all prefix rule on 2026-04-01 (incident 7).
TRUNCATE core.channel_map_scd2;
INSERT INTO core.channel_map_scd2 (source_label, match_type, channel, priority, version, valid_from, valid_to, change_note)
SELECT label, 'exact', channel, 10, 1, DATE '2025-05-01', DATE '2026-03-31', 'Initial mapping'
FROM (VALUES ('Paid Search', 'google_ads'), ('Paid Social', 'meta'), ('Facebook Lead Ad', 'meta'),
             ('Google Local Services', 'lsa'), ('Google Business Profile', 'gbp'), ('Organic Search', 'seo'),
             ('Direct traffic', 'direct'), ('Referral', 'referral'), ('Call', 'direct')) v(label, channel);
INSERT INTO core.channel_map_scd2 (source_label, match_type, channel, priority, version, valid_from, valid_to, change_note)
SELECT source_label, match_type, channel, priority, 2, DATE '2026-04-01', NULL, 'Carried over to v2'
FROM core.channel_map_scd2 WHERE version = 1;
INSERT INTO core.channel_map_scd2 (source_label, match_type, channel, priority, version, valid_from, valid_to, change_note)
VALUES ('Google%', 'prefix', 'google_ads', 90, 2, DATE '2026-04-01', NULL,
        'Catch-all for new Google Ads label variants; exact rules keep priority');
