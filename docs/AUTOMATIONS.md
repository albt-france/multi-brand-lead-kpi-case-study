# Automations

*Designs with pseudo-steps; no Zapier, Make or Google account was created. Each step names the code in this repository that does the work.*

## 1. New lead → audit → CRM
**Trigger**: form webhook (or Zapier "Catch Hook").
1. `integrations/webhook-intake` validates the payload, normalizes phone / e-mail, extracts UTM and click ids, computes the idempotency key, stores it in `raw.webhook_events` (a retried delivery is stored once).
2. Quick flags (honeypot, disposable domain, non-US phone, paid landing page without UTM) are returned with the 200 response.
3. If no flag: create / update the CRM contact with source, UTM, gclid and event_id (GoHighLevel API). If flagged: create it with the tag `review` instead of notifying sales.
4. The nightly SQL audit (`npm run audit`) gives the final verdict and links duplicates to the first lead.

## 2. Daily gap alert
**Trigger**: every day at 07:00 (cron / Supabase scheduled function).
1. Run the checks (`db/transforms/60_checks.sql`).
2. Select today's `fail` rows from `audit.check_results`.
3. If any: post one message per brand to the team channel: check name, observed value vs threshold, runbook link. If none: nothing (no noise).

## 3. Weekly report
**Trigger**: Monday 08:00.
1. Refresh the marts and export (`npm run export`).
2. Snapshot the closed week; freeze the month if it just closed (`audit.kpi_snapshots`).
3. Send a short e-mail per brand: qualified leads, CPQL by channel, Data Trust Score, open incidents, with a link to the dashboard filtered on the brand.

## Rules for every automation
- Idempotent (a rerun does not duplicate anything), logged, and failing loudly (an error notifies, never silently skips).
- Secrets in environment variables only (`.env.example` lists them, without values).
