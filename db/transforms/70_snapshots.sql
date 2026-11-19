-- 70_snapshots.sql : freeze monthly KPIs and prove history is protected (incident 7).
-- A closed month's numbers must never change when a mapping changes later.

-- Monthly leads per brand and CRM-label channel, using the SCD2 mapping valid on each lead's day.
CREATE OR REPLACE VIEW marts.monthly_label_kpis AS
SELECT date_trunc('month', local_date)::date AS month, brand, raw_channel AS channel,
       count(*) FILTER (WHERE status NOT IN ('duplicate', 'spam')) AS leads,
       max(map_version) AS map_version
FROM marts.lead_facts GROUP BY 1, 2, 3;

-- What the OLD pipeline did: map every lead with TODAY's table, catch-all patterns first.
-- After the 2026-04-01 edit, "Google Local Services" and "Google Business Profile" matched "Google%".
CREATE OR REPLACE VIEW marts.monthly_label_kpis_naive AS
SELECT date_trunc('month', f.local_date)::date AS month, f.brand,
       coalesce(m.channel, 'direct') AS channel,
       count(*) FILTER (WHERE f.status NOT IN ('duplicate', 'spam')) AS leads
FROM marts.lead_facts f
LEFT JOIN LATERAL (
  SELECT c.channel FROM core.channel_map_scd2 c
  WHERE c.valid_to IS NULL
    AND ((c.match_type = 'exact' AND c.source_label = f.attribution_source)
      OR (c.match_type = 'prefix' AND f.attribution_source LIKE c.source_label))
  ORDER BY (c.match_type = 'prefix') DESC LIMIT 1
) m ON true
GROUP BY 1, 2, 3;

-- Snapshot every closed month once (reporting "today" = 2026-11-18, so October 2026 is closed).
-- ON CONFLICT DO NOTHING: an existing snapshot is never overwritten.
INSERT INTO audit.kpi_snapshots (month, brand, channel, metric, value, map_version)
SELECT month, brand, channel, 'leads', leads, map_version
FROM marts.monthly_label_kpis WHERE month < DATE '2026-11-01'
ON CONFLICT DO NOTHING;

-- Comparison used by the dashboard: snapshot vs SCD2 recompute vs naive recompute.
CREATE OR REPLACE VIEW marts.history_check AS
SELECT s.month, s.brand, s.channel, s.value AS snapshot,
       coalesce(k.leads, 0) AS recomputed_scd2, coalesce(n.leads, 0) AS recomputed_naive
FROM audit.kpi_snapshots s
LEFT JOIN marts.monthly_label_kpis k USING (month, brand, channel)
LEFT JOIN marts.monthly_label_kpis_naive n USING (month, brand, channel)
WHERE s.metric = 'leads';

-- CHK11: one result per closed month (all brands).
DELETE FROM audit.check_results WHERE check_id = 'CHK11';
INSERT INTO audit.check_results (check_id, brand, date, observed, status, note)
SELECT 'CHK11', 'ALL', (month + interval '1 month - 1 day')::date,
       count(*) FILTER (WHERE snapshot <> recomputed_scd2),
       CASE WHEN count(*) FILTER (WHERE snapshot <> recomputed_scd2) = 0 THEN 'pass' ELSE 'fail' END,
       'a naive re-run would change ' || count(*) FILTER (WHERE snapshot <> recomputed_naive) || ' values this month'
FROM marts.history_check GROUP BY month;
