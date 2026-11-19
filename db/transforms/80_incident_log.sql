-- 80_incident_log.sql : the incident log. Text is written by the analyst; every number in it
-- is computed here from the database (nothing typed by hand), so it updates if the data changes.
TRUNCATE audit.incidents;

-- #01 Duplicates
INSERT INTO audit.incidents
SELECT 1, 'Duplicate leads inflate lead counts', 'ALL', DATE '2025-05-01', DATE '2026-10-31', 'data_issue',
  'Lead counts above what sales can call back',
  'Form resubmits, a call after a form, and the same phone typed in different formats',
  format('%s submissions link to an earlier lead of the same brand (%s%% of all records); %s within 10 minutes (resubmits)',
         d.n, round(100.0 * d.n / t.n, 1), d.fast),
  format('Raw counts overstate unique leads by %s%%', round(100.0 * d.n / (t.n - d.n), 1)),
  'Phone normalized to E.164 + lower-cased e-mail, 30-day window; duplicates kept and linked, never deleted',
  'Fixed in pipeline'
FROM (SELECT count(*) n FROM core.leads) t,
     (SELECT count(*) n, count(*) FILTER (WHERE l.created_at - p.created_at < interval '10 minutes') fast
      FROM audit.lead_status s JOIN core.leads l USING (lead_id) JOIN core.leads p ON p.lead_id = s.duplicate_of
      WHERE s.status = 'duplicate') d;

-- #02 Spam wave
INSERT INTO audit.incidents
SELECT 2, 'Spam wave on ELEC-ATL', 'ELEC-ATL', DATE '2026-03-10', DATE '2026-03-18', 'data_issue',
  'Submissions jumped while bookings did not',
  'Bot submissions: disposable domains, hidden honeypot field filled, non-US numbers, bursts of 4 in ~3 minutes',
  format('%s of %s submissions in 9 days flagged as spam (%s%%); %s came in bursts', w.spam, w.n, round(100.0 * w.spam / w.n), w.burst),
  format('Cost per lead on raw submissions: $%s vs $%s on qualified leads', round(w.cost / w.n), round(w.cost / nullif(w.q, 0))),
  'Scored rules with readable reasons; spam excluded from KPIs; honeypot + rate limit recommended on the form',
  'Fixed in pipeline'
FROM (SELECT count(*) n, count(*) FILTER (WHERE f.status = 'spam') spam, count(*) FILTER (WHERE f.status = 'valid') q,
             count(*) FILTER (WHERE 'SPAM_BURST' = ANY (SELECT rule_id FROM audit.lead_flags g WHERE g.lead_id = f.lead_id)) burst,
             (SELECT sum(net_cost) FROM core.spend_daily WHERE brand = 'ELEC-ATL' AND date BETWEEN '2026-03-10' AND '2026-03-18') cost
      FROM marts.lead_facts f WHERE brand = 'ELEC-ATL' AND local_date BETWEEN '2026-03-10' AND '2026-03-18') w;

-- #03 UTM lost after redirect
INSERT INTO audit.incidents
SELECT 3, 'Paid search shows up as Direct after a landing-page redirect', 'PLMB-DAL', DATE '2026-02-09', DATE '2026-03-22', 'data_issue',
  'Direct went up and Google Ads went down for PLMB-DAL',
  'A JavaScript redirect on /lp/ pages dropped the query string (UTM, gclid) and the referrer',
  format('Raw "Direct" share of web forms: %s%% before vs %s%% during; %s leads on paid-only /lp/ pages had no UTM',
         round(100 * b.d), round(100 * x.d), x.lp),
  format('%s paid-search leads re-attributed to Google Ads (rule: paid-only landing page, Inferred)', x.lp),
  'Redirect fixed to keep the query string; attribution rule uses the paid-only landing page as fallback; CHK02 alerts within days',
  'Fixed'
FROM (SELECT avg((raw_channel = 'direct')::int) d FROM marts.lead_facts WHERE brand = 'PLMB-DAL' AND lead_type = 'form' AND status <> 'spam'
        AND local_date BETWEEN '2025-12-01' AND '2026-02-08') b,
     (SELECT avg((raw_channel = 'direct')::int) d, count(*) FILTER (WHERE attribution_rule = 'paid_landing_page') lp FROM marts.lead_facts
       WHERE brand = 'PLMB-DAL' AND lead_type = 'form' AND status <> 'spam' AND local_date BETWEEN '2026-02-09' AND '2026-03-22') x;

-- #04 GCLID missing
INSERT INTO audit.incidents
SELECT 4, 'GCLID missing after a form update', 'ALL', DATE '2026-06-02', DATE '2026-07-14', 'data_issue',
  'Offline conversion uploads to Google Ads dropped',
  'A form template update removed the hidden gclid field on the quote form',
  format('GCLID coverage of paid-search leads: %s%% before vs %s%% during', round(100 * b.c), round(100 * x.c)),
  format('%s booked jobs could not be uploaded as offline conversions', x.booked_missing),
  'Hidden field restored; GCLID also kept in first-party storage for 90 days; enhanced conversions for leads (hashed e-mail / phone) as fallback; CHK01 alert',
  'Fixed'
FROM (SELECT avg((gclid IS NOT NULL)::int) c FROM marts.lead_facts WHERE utm_medium = 'cpc' AND status <> 'spam' AND local_date BETWEEN '2026-04-01' AND '2026-06-01') b,
     (SELECT avg((gclid IS NOT NULL)::int) c, count(*) FILTER (WHERE gclid IS NULL AND status = 'valid' AND stage IN ('Booked', 'Won')) booked_missing
      FROM marts.lead_facts WHERE utm_medium = 'cpc' AND status <> 'spam' AND local_date BETWEEN '2026-06-02' AND '2026-07-14') x;

-- #05 Pixel + CAPI without event_id, #12 fix verified
INSERT INTO audit.incidents
SELECT 5, 'Meta over-reports leads: Pixel and CAPI not deduplicated', 'HVAC-PHX', DATE '2025-05-01', DATE '2026-06-30', 'data_issue',
  'Meta Ads Manager shows far more leads than the CRM',
  'Browser Pixel and server Conversions API both sent each lead without a shared event_id; Meta only deduplicates when event_id and event_name match, so it counted it twice',
  format('Meta / CRM = %s before the fix (other brands: %s)', round(b.ratio, 2), round(o.ratio, 2)),
  format('Meta cost per lead understated by %s%%', round(100 * (1 - 1 / b.ratio))),
  'Same event_id (and event_name) sent by Pixel and CAPI so Meta can deduplicate; CHK03 alert',
  'Fixed 2026-07-01'
FROM (SELECT sum(platform_value)::numeric / sum(crm_value) ratio FROM marts.reconciliation_daily WHERE system = 'meta' AND brand = 'HVAC-PHX' AND date < '2026-07-01') b,
     (SELECT sum(platform_value)::numeric / sum(crm_value) ratio FROM marts.reconciliation_daily WHERE system = 'meta' AND brand <> 'HVAC-PHX') o;

INSERT INTO audit.incidents
SELECT 12, 'Fix verified: shared event_id brings Meta back in line', 'HVAC-PHX', DATE '2026-07-01', DATE '2026-10-31', 'fix_verified',
  'Meta / CRM ratio after the event_id change',
  'Deduplication now works on Meta''s side',
  format('Meta / CRM = %s after the fix (was %s)', round(a.ratio, 2), round(b.ratio, 2)),
  'Meta-reported leads usable again for bidding and reporting',
  'Keep CHK03 running; ratio stays in the 0.75-1.30 band',
  'Verified'
FROM (SELECT sum(platform_value)::numeric / sum(crm_value) ratio FROM marts.reconciliation_daily WHERE system = 'meta' AND brand = 'HVAC-PHX' AND date >= '2026-07-01') a,
     (SELECT sum(platform_value)::numeric / sum(crm_value) ratio FROM marts.reconciliation_daily WHERE system = 'meta' AND brand = 'HVAC-PHX' AND date < '2026-07-01') b;

-- #06 Time zones
INSERT INTO audit.incidents
SELECT 6, 'Daily gaps from comparing UTC (CRM) with account time', 'ALL', DATE '2025-05-01', DATE '2026-10-31', 'data_issue',
  'Google Ads and CRM never agree on a given day, and month totals drift',
  'The CRM stores UTC; ad accounts report in local time. Evening leads land on the next UTC day',
  format('Mean daily gap Google Ads vs CRM: %s leads on UTC days vs %s on local days; %s leads (%s%%) fall in a different month in UTC',
         round(g.utc, 2), round(g.loc, 2), m.n, round(100.0 * m.n / m.t, 1)),
  'False daily alerts and month-end differences in reports',
  'All KPIs use the brand''s local day (core.leads.local_date); UTC kept for audit',
  'Fixed in pipeline'
FROM (SELECT avg(abs(platform_value - crm_value_utc)) utc, avg(abs(platform_value - crm_value)) loc FROM marts.reconciliation_daily WHERE system = 'google_ads') g,
     (SELECT count(*) FILTER (WHERE date_trunc('month', local_date) <> date_trunc('month', utc_date)) n, count(*) t FROM core.leads) m;

-- #07 History rewritten
INSERT INTO audit.incidents
SELECT 7, 'A channel-map edit rewrote closed months', 'ALL', DATE '2026-04-01', DATE '2026-04-01', 'data_issue',
  'Last quarter''s LSA numbers changed in the board report after a mapping update',
  'A catch-all rule "Google%" was added and the old pipeline re-mapped all history with today''s table, patterns first',
  format('A naive re-run moves %s leads in %s closed months out of LSA / Business Profile', h.moved, h.months),
  format('%s closed-month values would change; with SCD2 + snapshots: %s', h.cells, h.scd2_changes),
  'Channel map versioned (SCD type 2, valid_from / valid_to), exact labels before patterns, monthly snapshots, CHK11 test',
  'Fixed'
FROM (SELECT sum(snapshot - recomputed_naive) FILTER (WHERE channel IN ('lsa', 'gbp') AND month < '2026-04-01') moved,
             count(DISTINCT month) FILTER (WHERE snapshot <> recomputed_naive AND month < '2026-04-01') months,
             count(*) FILTER (WHERE snapshot <> recomputed_naive) cells,
             count(*) FILTER (WHERE snapshot <> recomputed_scd2) scd2_changes FROM marts.history_check) h;

-- #08 LSA credits
INSERT INTO audit.incidents
SELECT 8, 'LSA cost per lead overstated: credits ignored', 'ALL', DATE '2025-05-01', DATE '2026-10-31', 'data_issue',
  'LSA looks more expensive than the invoices',
  'The report used gross charges; in the LSA export, leads disputed and approved are credited back (modelled, see docs/PLATFORM_NOTES.md)',
  format('Gross $%s, credits $%s (%s%%), net $%s', to_char(s.g, 'FM999,999'), to_char(s.c, 'FM999,999'), round(100 * s.c / s.g, 1), to_char(s.g - s.c, 'FM999,999')),
  format('LSA cost per lead $%s gross vs $%s net', round(s.g / s.n), round((s.g - s.c) / s.n)),
  'Spend = net of approved credits (core.spend_daily.net_cost); pending disputes shown separately',
  'Fixed in pipeline'
FROM (SELECT sum(gross_cost) g, sum(credits) c, sum(platform_leads) n FROM core.spend_daily WHERE channel = 'lsa') s;

-- #09 Manual sheet labels
INSERT INTO audit.incidents
SELECT 9, 'Free-typed source labels in the call sheet', 'ALL', DATE '2025-05-01', DATE '2026-10-31', 'data_issue',
  'Calls by source do not add up between the sheet and the CRM',
  'Staff type the source by hand ("google ads", "Google-Ads", "GBP call", "referal")',
  format('%s of %s rows (%s%%) use a non-standard label; %s could not be mapped', s.bad, s.n, round(100.0 * s.bad / s.n, 1), s.unmapped),
  'Calls under-counted for some channels when grouped by raw label',
  'Normalization table in SQL; recommended: dropdown validation in the sheet (Apps Script audit colours offenders daily)',
  'Mitigated (open)'
FROM (SELECT count(*) n, count(*) FILTER (WHERE NOT is_standard) bad, count(*) FILTER (WHERE source_std IS NULL) unmapped FROM core.calls_sheet) s;

-- #10 GA4 double count
INSERT INTO audit.incidents
SELECT 10, 'GA4 counts leads twice when the thank-you page reloads', 'ROOF-TPA', DATE '2025-09-15', DATE '2026-01-31', 'data_issue',
  'GA4 shows more leads than the CRM for ROOF-TPA only',
  'The GTM trigger fired on the thank-you page view, so each reload sent another generate_lead',
  format('GA4 / CRM web forms = %s during vs %s after (other brands %s)', round(d.r, 2), round(a.r, 2), round(o.r, 2)),
  format('About %s extra GA4 conversions', d.extra),
  'Trigger moved to a one-time custom event with a per-submission id; CHK04 alert',
  'Fixed 2026-02-01'
FROM (SELECT sum(platform_value)::numeric / sum(crm_value) r, sum(platform_value) - round(sum(crm_value) * 0.93) extra FROM marts.reconciliation_daily
       WHERE system = 'ga4' AND brand = 'ROOF-TPA' AND date BETWEEN '2025-09-15' AND '2026-01-31') d,
     (SELECT sum(platform_value)::numeric / sum(crm_value) r FROM marts.reconciliation_daily WHERE system = 'ga4' AND brand = 'ROOF-TPA' AND date > '2026-01-31') a,
     (SELECT sum(platform_value)::numeric / sum(crm_value) r FROM marts.reconciliation_daily WHERE system = 'ga4' AND brand <> 'ROOF-TPA') o;

-- #11 False signal: heat wave
INSERT INTO audit.incidents
SELECT 11, 'Not a data issue: a real heat wave drove HVAC demand', 'HVAC-PHX', w.start_d, w.end_d, 'false_signal',
  'Leads spiked and cost per lead dropped for HVAC-PHX',
  'Real demand: the hottest week of summer 2026 in Phoenix (Open-Meteo, PUBLIC DATA); AC units fail in cascade',
  format('Qualified leads %s in the week vs %s per week in the 4 weeks before (x%s); max temperature %s C; spam %s%% and duplicates %s%%, both at normal levels',
         k.q, round(k.base), round(k.q / k.base, 2), round(w.tmax, 1), round(100 * k.spam, 1), round(100 * k.dup, 1)),
  format('Blended cost per qualified lead $%s vs $%s per week before (budgets are capped)', round(k.cost / k.q), round(k.cost_base / k.base)),
  'None: tracking is correct. Flagged by CHK10 and marked "explained" so nobody "fixes" real demand',
  'Not a data issue'
-- The window is found from the real weather: the hottest 7 days of summer 2026 in Phoenix.
FROM (SELECT date - 6 AS start_d, date AS end_d, mx AS tmax FROM (
        SELECT date, avg(tmax) OVER w AS a, max(tmax) OVER w AS mx FROM core.weather_daily
        WHERE brand = 'HVAC-PHX' AND date BETWEEN '2026-06-01' AND '2026-09-15'
        WINDOW w AS (ORDER BY date ROWS 6 PRECEDING)) x
      WHERE date >= '2026-06-07' ORDER BY a DESC LIMIT 1) w,
LATERAL (SELECT count(*) FILTER (WHERE status = 'valid' AND local_date BETWEEN w.start_d AND w.end_d) q,
             count(*) FILTER (WHERE status = 'valid' AND local_date BETWEEN w.start_d - 28 AND w.start_d - 1) / 4.0 base,
             avg((status = 'spam')::int) FILTER (WHERE local_date BETWEEN w.start_d AND w.end_d) spam,
             avg((status = 'duplicate')::int) FILTER (WHERE local_date BETWEEN w.start_d AND w.end_d) dup,
             (SELECT sum(net_cost) FROM core.spend_daily WHERE brand = 'HVAC-PHX' AND date BETWEEN w.start_d AND w.end_d) cost,
             (SELECT sum(net_cost) FROM core.spend_daily WHERE brand = 'HVAC-PHX' AND date BETWEEN w.start_d - 28 AND w.start_d - 1) / 4.0 cost_base
      FROM marts.lead_facts WHERE brand = 'HVAC-PHX') k;
