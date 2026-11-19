-- 20_duplicates.sql : a lead is a duplicate when an EARLIER non-spam lead of the same brand
-- has the same normalized phone or e-mail within the previous 30 days.
-- Normalization matters: "(602) 555-0123", "602.555.0123" and "+16025550123" are one number.
DELETE FROM audit.lead_flags WHERE flag_type = 'duplicate';

CREATE TEMP TABLE IF NOT EXISTS spam_ids (lead_id text PRIMARY KEY);
TRUNCATE spam_ids;
INSERT INTO spam_ids
SELECT lead_id FROM audit.lead_flags WHERE flag_type = 'spam' GROUP BY lead_id HAVING sum(score) >= 0.6;

INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason, related_lead_id)
SELECT l.lead_id, 'DUP_PHONE', 1, 'duplicate', 1,
       'same phone as ' || p.lead_id || ', ' || audit.human_gap(l.created_at - p.created_at) || ' earlier', p.lead_id
FROM core.leads l
JOIN LATERAL (
  SELECT e.lead_id, e.created_at FROM core.leads e
  WHERE e.brand = l.brand AND e.phone_e164 = l.phone_e164
    AND e.created_at < l.created_at AND e.created_at >= l.created_at - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM spam_ids s WHERE s.lead_id = e.lead_id)
  ORDER BY e.created_at LIMIT 1
) p ON true
WHERE l.phone_e164 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM spam_ids s WHERE s.lead_id = l.lead_id);

INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason, related_lead_id)
SELECT l.lead_id, 'DUP_EMAIL', 1, 'duplicate', 1,
       'same e-mail as ' || p.lead_id || ', ' || audit.human_gap(l.created_at - p.created_at) || ' earlier', p.lead_id
FROM core.leads l
JOIN LATERAL (
  SELECT e.lead_id, e.created_at FROM core.leads e
  WHERE e.brand = l.brand AND e.email_norm = l.email_norm
    AND e.created_at < l.created_at AND e.created_at >= l.created_at - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM spam_ids s WHERE s.lead_id = e.lead_id)
  ORDER BY e.created_at LIMIT 1
) p ON true
WHERE l.email_norm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM spam_ids s WHERE s.lead_id = l.lead_id);
