-- 004_audit.sql
-- Audit layer: what each rule found, why, and with which rule version.

CREATE TABLE IF NOT EXISTS audit.rules (
  rule_id text PRIMARY KEY, version int NOT NULL, flag_type text NOT NULL,
  weight numeric, description text NOT NULL
);
INSERT INTO audit.rules VALUES
  ('DUP_PHONE', 1, 'duplicate', NULL, 'Same normalized phone, same brand, within 30 days of an earlier lead'),
  ('DUP_EMAIL', 1, 'duplicate', NULL, 'Same lower-cased e-mail, same brand, within 30 days of an earlier lead'),
  ('SPAM_HONEYPOT', 1, 'spam', 0.60, 'Hidden "website" field filled: humans never see it, bots fill it'),
  ('SPAM_DISPOSABLE', 1, 'spam', 0.45, 'E-mail domain is on the public disposable-domain list'),
  ('SPAM_BURST', 1, 'spam', 0.40, '3 or more submissions from one address within 5 minutes'),
  ('SPAM_FOREIGN_PHONE', 1, 'spam', 0.35, 'Phone number is not a US number'),
  ('SPAM_TEXT', 1, 'spam', 0.25, 'Message scored > 0.8 by the text classifier (secondary signal only)'),
  ('INVALID_PHONE', 1, 'invalid', NULL, 'Phone cannot exist in the US (area code not in service, missing digits)'),
  ('INVALID_EMAIL', 1, 'invalid', NULL, 'E-mail is not a well-formed address')
ON CONFLICT DO NOTHING;

-- One row per (lead, rule) that fired. Readable reason + score + rule version.
CREATE TABLE IF NOT EXISTS audit.lead_flags (
  lead_id text NOT NULL, rule_id text NOT NULL REFERENCES audit.rules, rule_version int NOT NULL,
  flag_type text NOT NULL, score numeric, reason text NOT NULL, related_lead_id text,
  flagged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, rule_id)
);

-- Final verdict per lead. Precedence: spam > duplicate > invalid > valid.
CREATE TABLE IF NOT EXISTS audit.lead_status (
  lead_id text PRIMARY KEY, status text NOT NULL, spam_score numeric NOT NULL,
  duplicate_of text, reasons text[] NOT NULL
);

-- Automated checks: definition, then one result per brand and day.
CREATE TABLE IF NOT EXISTS audit.checks (
  check_id text PRIMARY KEY, name text NOT NULL, rule text NOT NULL, threshold text NOT NULL,
  window_days int NOT NULL, runbook text
);
CREATE TABLE IF NOT EXISTS audit.check_results (
  check_id text REFERENCES audit.checks, brand text, date date, observed numeric,
  status text CHECK (status IN ('pass', 'warn', 'fail', 'explained', 'n/a')),
  note text, PRIMARY KEY (check_id, brand, date)
);

-- Monthly KPI snapshots: once a month is closed its numbers are frozen here.
-- tests/history.sql fails if recomputing a closed month gives a different value.
CREATE TABLE IF NOT EXISTS audit.kpi_snapshots (
  month date, brand text, channel text, metric text, value numeric, map_version int,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, brand, channel, metric)
);

-- Incident log written by the analysis (cause, evidence, quantified impact, fix, status).
CREATE TABLE IF NOT EXISTS audit.incidents (
  incident_no int PRIMARY KEY, title text, brand text, start_date date, end_date date,
  kind text,           -- data_issue | false_signal | fix_verified
  symptom text, root_cause text, evidence text, impact text, fix text, status text
);

-- "3 min", "5 h", "2 days": short human-readable gaps used in flag reasons.
CREATE OR REPLACE FUNCTION audit.human_gap(i interval) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN i < interval '1 hour' THEN greatest(1, round(extract(epoch FROM i) / 60))::text || ' min'
    WHEN i < interval '2 days' THEN round(extract(epoch FROM i) / 3600)::text || ' h'
    ELSE round(extract(epoch FROM i) / 86400)::text || ' days' END
$$;
