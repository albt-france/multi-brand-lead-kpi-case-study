-- 50_attribution.sql : raw channel (what the CRM label says) and corrected channel (evidence first).
-- Priority: integration label > gclid > fbclid > UTM > paid-only landing page > referrer
--           > staff call log > CRM label > direct.
-- Click ids and UTMs are Verified evidence; landing page, call log and labels are Inferred.
TRUNCATE core.touches;

WITH label_map AS (
  -- Channel map row valid ON THE LEAD'S DAY (SCD2). Exact labels win over prefix catch-alls.
  SELECT l.lead_id, m.channel, m.version
  FROM core.leads l
  LEFT JOIN LATERAL (
    SELECT c.channel, c.version FROM core.channel_map_scd2 c
    WHERE l.local_date >= c.valid_from AND (c.valid_to IS NULL OR l.local_date <= c.valid_to)
      AND ((c.match_type = 'exact' AND c.source_label = l.attribution_source)
        OR (c.match_type = 'prefix' AND l.attribution_source LIKE c.source_label))
    ORDER BY c.priority LIMIT 1
  ) m ON true
),
call_log AS (
  -- A call in the CRM matched to the staff sheet: same brand, same phone, same day.
  SELECT DISTINCT ON (l.lead_id) l.lead_id, s.source_std
  FROM core.leads l
  JOIN core.calls_sheet s ON s.brand = l.brand AND s.phone_e164 = l.phone_e164 AND s.call_date = l.local_date
  WHERE l.lead_type = 'call' AND s.source_std IS NOT NULL
  ORDER BY l.lead_id, s.row_id
)
INSERT INTO core.touches (lead_id, raw_channel, corrected_channel, rule, confidence, map_version)
SELECT l.lead_id, m.channel, x.ch, x.rule,
       CASE WHEN x.rule IN ('paid_landing_page', 'staff_call_log', 'crm_label', 'default') THEN 'Inferred' ELSE 'Verified' END,
       m.version
FROM core.leads l
JOIN label_map m USING (lead_id)
LEFT JOIN call_log c USING (lead_id)
CROSS JOIN LATERAL (
  SELECT v.ch, v.rule FROM (VALUES
    (1,  l.attribution_source IN ('Google Local Services', 'Facebook Lead Ad', 'Google Business Profile'), m.channel, 'integration_label'),
    (2,  l.gclid IS NOT NULL, 'google_ads', 'gclid'),
    (3,  l.fbclid IS NOT NULL, 'meta', 'fbclid'),
    (4,  l.utm_source = 'google' AND l.utm_medium = 'cpc', 'google_ads', 'utm'),
    (5,  l.utm_source = 'facebook', 'meta', 'utm'),
    (6,  l.utm_source = 'google' AND l.utm_medium = 'organic' AND l.utm_campaign = 'gbp-listing', 'gbp', 'utm'),
    (7,  l.landing_page LIKE '/lp/%', 'google_ads', 'paid_landing_page'),     -- pages only paid search links to
    (8,  l.landing_page LIKE '/offer/%', 'meta', 'paid_landing_page'),        -- pages only Meta ads link to
    (9,  l.referrer ~ '(google|bing)\.', 'seo', 'referrer'),
    (10, l.referrer IS NOT NULL, 'referral', 'referrer'),
    (11, c.source_std IS NOT NULL, c.source_std, 'staff_call_log'),
    (12, m.channel IS NOT NULL, m.channel, 'crm_label'),
    (13, true, 'direct', 'default')
  ) v(prio, ok, ch, rule)
  WHERE v.ok ORDER BY v.prio LIMIT 1
) x;
