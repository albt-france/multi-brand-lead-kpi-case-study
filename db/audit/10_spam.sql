-- 10_spam.sql : spam signals. Each signal adds a weight; a lead is spam when the total is >= 0.6.
-- One signal alone is never enough except the honeypot (a field humans cannot see).
DELETE FROM audit.lead_flags WHERE flag_type = 'spam';

-- Honeypot: the hidden "website" field was filled.
INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT lead_id, 'SPAM_HONEYPOT', 1, 'spam', 0.60, 'honeypot filled'
FROM core.leads WHERE honeypot IS NOT NULL;

-- Disposable e-mail domain (public CC0 list).
INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT l.lead_id, 'SPAM_DISPOSABLE', 1, 'spam', 0.45, 'disposable domain (' || l.email_domain || ')'
FROM core.leads l JOIN raw.disposable_domains d ON d.domain = l.email_domain;

-- Bursts: 3+ submissions from the same address within 5 minutes of this one.
INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT l.lead_id, 'SPAM_BURST', 1, 'spam', 0.40,
       b.n || ' submissions in ' || audit.human_gap(b.span) || ' from one address'
FROM core.leads l
JOIN LATERAL (
  SELECT count(*) AS n, max(e.created_at) - min(e.created_at) AS span
  FROM core.leads e
  WHERE e.ip_hash = l.ip_hash
    AND e.created_at BETWEEN l.created_at - interval '5 minutes' AND l.created_at + interval '5 minutes'
) b ON b.n >= 3;

-- Phone number outside the US.
INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT lead_id, 'SPAM_FOREIGN_PHONE', 1, 'spam', 0.35, 'non-US phone (' || phone_country || ')'
FROM core.leads WHERE phone_country IS NOT NULL AND phone_country <> 'US';

-- Text classifier (trained on PUBLIC SMS data): secondary signal, low weight.
INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT m.lead_id, 'SPAM_TEXT', 1, 'spam', 0.25,
       'message looks like spam (p=' || round(m.text_spam_prob::numeric, 2) || ')'
FROM raw.message_scores m JOIN core.leads l USING (lead_id)
WHERE m.text_spam_prob::numeric > 0.8;
