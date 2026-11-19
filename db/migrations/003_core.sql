-- 003_core.sql
-- Typed staging tables and the core business model.

-- Phone numbers are normalized in TypeScript with libphonenumber (scripts/db_build.ts),
-- because PostgreSQL has no phone-number library. One row per distinct raw string.
CREATE TABLE IF NOT EXISTS staging.phone_norm (
  phone_raw text PRIMARY KEY,
  phone_e164 text,          -- e.g. +16025550123 (NULL when it cannot be parsed)
  phone_country text,       -- ISO country of the number, e.g. US, GB, AU
  phone_valid boolean       -- true when libphonenumber says the number can exist
);

CREATE TABLE IF NOT EXISTS core.brands (
  brand text PRIMARY KEY,   -- fictional code, e.g. HVAC-PHX (displayed HVAC·PHX)
  trade text, city text, tz text NOT NULL, county text, population_2025 integer
);

CREATE TABLE IF NOT EXISTS core.channels (
  channel text PRIMARY KEY, label text NOT NULL, is_paid boolean NOT NULL, sort int NOT NULL
);
INSERT INTO core.channels VALUES
  ('google_ads', 'Google Ads Search', true, 1), ('lsa', 'Local Services Ads', true, 2),
  ('meta', 'Meta Ads', true, 3), ('gbp', 'Google Business Profile', false, 4),
  ('seo', 'Organic search', false, 5), ('direct', 'Direct', false, 6), ('referral', 'Referral', false, 7)
ON CONFLICT DO NOTHING;

-- Versioned channel map (slowly changing dimension, type 2).
-- A change never UPDATEs a mapping in place: it closes the old row (valid_to) and inserts a new one,
-- so every lead is mapped with the rule that was valid on the day it arrived.
CREATE TABLE IF NOT EXISTS core.channel_map_scd2 (
  map_id serial PRIMARY KEY,
  source_label text NOT NULL,          -- CRM attribution label, or a prefix pattern
  match_type text NOT NULL CHECK (match_type IN ('exact', 'prefix')),
  channel text NOT NULL REFERENCES core.channels,
  priority int NOT NULL,               -- lower wins; exact rules are 10, catch-all prefixes 90
  version int NOT NULL,
  valid_from date NOT NULL,
  valid_to date,                       -- NULL = still valid
  change_note text
);

CREATE TABLE IF NOT EXISTS core.leads (
  lead_id text PRIMARY KEY,
  brand text NOT NULL REFERENCES core.brands,
  created_at timestamptz NOT NULL,     -- CRM time, stored in UTC
  local_date date NOT NULL,            -- calendar day in the brand's time zone (KPI day)
  utc_date date NOT NULL,              -- calendar day in UTC (what a naive CRM report shows)
  lead_type text NOT NULL,             -- form | call
  form_id text,
  attribution_source text,             -- the CRM's own attribution label
  utm_source text, utm_medium text, utm_campaign text,
  gclid text, fbclid text, landing_page text, referrer text,
  phone_raw text, phone_e164 text, phone_country text, phone_valid boolean,
  email_raw text, email_norm text, email_domain text,
  message text, honeypot text, ip_hash text,
  stage text, job_value_usd numeric
);
CREATE INDEX IF NOT EXISTS leads_phone ON core.leads (brand, phone_e164, created_at);
CREATE INDEX IF NOT EXISTS leads_email ON core.leads (brand, email_norm, created_at);
CREATE INDEX IF NOT EXISTS leads_ip ON core.leads (ip_hash, created_at);

-- One row per real person (cluster of a lead and its duplicates), built by the duplicate rule.
CREATE TABLE IF NOT EXISTS core.contacts (
  contact_id text PRIMARY KEY, brand text, first_lead_id text, phone_e164 text, email_norm text,
  lead_count int
);

-- Attribution evidence and result, one row per lead.
CREATE TABLE IF NOT EXISTS core.touches (
  lead_id text PRIMARY KEY REFERENCES core.leads,
  raw_channel text,          -- what the CRM label says (channel map at lead date)
  corrected_channel text,    -- after the priority rules
  rule text,                 -- which rule decided
  confidence text,           -- Verified (click id / UTM / integration) or Inferred
  map_version int
);

CREATE TABLE IF NOT EXISTS core.spend_daily (
  brand text, date date, channel text, gross_cost numeric, credits numeric, net_cost numeric,
  clicks int, impressions int, platform_leads int, platform_leads_conv_time int,
  PRIMARY KEY (brand, date, channel)
);

CREATE TABLE IF NOT EXISTS core.calls_sheet (
  row_id serial PRIMARY KEY, brand text, call_date date, phone_e164 text, source_raw text,
  source_std text,           -- label after normalization (NULL = could not be mapped)
  is_standard boolean,       -- true when the typed label was already in the controlled list
  booked boolean
);

CREATE TABLE IF NOT EXISTS core.weather_daily (
  brand text, date date, tmax numeric, tmin numeric, precip numeric, PRIMARY KEY (brand, date)
);

CREATE TABLE IF NOT EXISTS core.ga4_daily (       -- GA4 generate_lead events per property day
  brand text, date date, generate_lead int, PRIMARY KEY (brand, date)
);
