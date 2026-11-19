-- 30_invalid.sql : contact details that cannot be used to reach a real US customer.
DELETE FROM audit.lead_flags WHERE flag_type = 'invalid';

INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT lead_id, 'INVALID_PHONE', 1, 'invalid', 1,
       CASE
         WHEN length(regexp_replace(phone_raw, '\D', '', 'g')) < 10
           THEN 'phone has only ' || length(regexp_replace(phone_raw, '\D', '', 'g')) || ' digits'
         WHEN phone_country IS DISTINCT FROM 'US' THEN 'not a US number'
         ELSE 'area code (' || substr(phone_e164, 3, 3) || ') not in service'
       END
FROM core.leads
WHERE phone_raw IS NOT NULL AND (phone_valid IS NOT TRUE OR phone_country IS DISTINCT FROM 'US');

INSERT INTO audit.lead_flags (lead_id, rule_id, rule_version, flag_type, score, reason)
SELECT lead_id, 'INVALID_EMAIL', 1, 'invalid', 1, 'malformed e-mail'
FROM core.leads
WHERE email_norm IS NOT NULL AND email_norm !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$';
