-- 002_raw.sql
-- Landing tables: one per source system, columns in the same order as the export files.
-- Everything is text on purpose: raw keeps what the system sent, typing happens in staging.

CREATE TABLE IF NOT EXISTS raw.crm_contacts (          -- GoHighLevel-style CRM export (timestamps in UTC)
  lead_id text, brand text, created_at_utc text, lead_type text, form_id text, attribution_source text,
  utm_source text, utm_medium text, utm_campaign text, gclid text, fbclid text, landing_page text,
  referrer text, phone text, email text, message text, honeypot text, ip_hash text, stage text,
  job_value_usd text
);

CREATE TABLE IF NOT EXISTS raw.google_ads_daily (       -- day in the ACCOUNT time zone; conversions by click date
  date text, account text, campaign text, impressions text, clicks text, cost text, conversions text,
  conversions_by_conv_time text
);

CREATE TABLE IF NOT EXISTS raw.lsa_leads (              -- Local Services Ads lead report
  lsa_lead_id text, account text, lead_date text, lead_type text, consumer_phone text, charged text,
  charge_usd text, dispute_status text, credit_usd text
);

CREATE TABLE IF NOT EXISTS raw.meta_ads_daily (         -- Meta Ads report: leads as Meta counts them
  date text, account text, campaign text, amount_spent text, impressions text, link_clicks text,
  leads text, pixel_leads text, capi_leads text
);

CREATE TABLE IF NOT EXISTS raw.ga4_events_daily (       -- GA4 generate_lead events, property time zone
  date text, property text, event_name text, event_count text
);

CREATE TABLE IF NOT EXISTS raw.manual_calls_sheet (     -- call log typed by office staff (Google Sheet)
  call_date text, brand text, caller_phone text, source text, booked text, entered_by text
);

CREATE TABLE IF NOT EXISTS raw.brands (
  brand text, trade text, city text, tz text, fips text, county text, population_2025 text
);

CREATE TABLE IF NOT EXISTS raw.weather_daily (          -- PUBLIC DATA: Open-Meteo archive (CC BY 4.0)
  date text, tmax text, tmin text, precip text, brand text
);

CREATE TABLE IF NOT EXISTS raw.disposable_domains (     -- PUBLIC DATA: disposable-email-domains (CC0)
  domain text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS raw.message_scores (         -- output of the PUBLIC-DATA text classifier
  lead_id text, text_spam_prob text
);

-- Form webhooks land here as JSON. dedup_key is UNIQUE, so a webhook delivered twice
-- (providers retry on timeouts) is stored once: the intake is idempotent.
CREATE TABLE IF NOT EXISTS raw.webhook_events (
  id bigserial PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL
);
