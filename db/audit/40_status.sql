-- 40_status.sql : one verdict per lead (spam > duplicate > invalid > valid) and the contacts table.
TRUNCATE audit.lead_status;

INSERT INTO audit.lead_status (lead_id, status, spam_score, duplicate_of, reasons)
SELECT l.lead_id,
       CASE WHEN coalesce(s.score, 0) >= 0.6 THEN 'spam'
            WHEN d.related IS NOT NULL THEN 'duplicate'
            WHEN i.lead_id IS NOT NULL THEN 'invalid'
            ELSE 'valid' END,
       coalesce(s.score, 0),
       d.related,
       coalesce(r.reasons, '{}')
FROM core.leads l
LEFT JOIN (SELECT lead_id, sum(score) AS score FROM audit.lead_flags WHERE flag_type = 'spam' GROUP BY 1) s USING (lead_id)
LEFT JOIN (SELECT DISTINCT ON (lead_id) lead_id, related_lead_id AS related FROM audit.lead_flags
           WHERE flag_type = 'duplicate' ORDER BY lead_id, rule_id DESC) d USING (lead_id)   -- prefer phone match
LEFT JOIN (SELECT DISTINCT lead_id FROM audit.lead_flags WHERE flag_type = 'invalid') i USING (lead_id)
LEFT JOIN (SELECT lead_id, array_agg(reason ORDER BY score DESC, rule_id) AS reasons FROM audit.lead_flags GROUP BY 1) r USING (lead_id);

-- Contacts: follow duplicate links back to the first lead of each person (recursive walk).
TRUNCATE core.contacts;
WITH RECURSIVE chain AS (
  SELECT lead_id, lead_id AS root FROM audit.lead_status WHERE status <> 'spam' AND duplicate_of IS NULL
  UNION ALL
  SELECT s.lead_id, c.root FROM audit.lead_status s JOIN chain c ON s.duplicate_of = c.lead_id
  WHERE s.status = 'duplicate'
)
INSERT INTO core.contacts (contact_id, brand, first_lead_id, phone_e164, email_norm, lead_count)
SELECT 'contact_' || substr(c.root, 6), l.brand, c.root, l.phone_e164, l.email_norm, count(*)
FROM chain c JOIN core.leads l ON l.lead_id = c.root
GROUP BY c.root, l.brand, l.phone_e164, l.email_norm;
