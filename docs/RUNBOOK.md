# Runbook: what to do when a check fails

Each automated check links here. First rule: **rule out tracking before reporting a business change**, and never "fix" a number that real demand explains.

## gclid (CHK01: GCLID coverage < 80%)
1. Submit a test form from a URL with `?gclid=TEST`: is the hidden field present and filled? (`/lab` step 2)
2. Check the latest form template deploy (incident #04 was a removed hidden field).
3. Until fixed: send booked jobs through enhanced conversions for leads (hashed e-mail / phone).

## utm (CHK02: paid landing pages without UTM > 5%)
1. Open a paid landing URL with UTMs and follow the redirects: is the query string kept?
2. Check JavaScript redirects (they also drop the referrer).
3. Re-attribution is automatic (`paid_landing_page` rule, Inferred); fix the redirect anyway.

## capi (CHK03: Meta / CRM outside 0.75–1.30)
1. Events Manager: are browser and server events deduplicated? Same `event_id` and `event_name` on both?
2. Compare Pixel-only and CAPI-only counts in the export: about 2× CRM means no deduplication (incident #05).

## ga4 (CHK04: GA4 / CRM outside 0.80–1.08)
1. Reload the thank-you page in GTM preview: does `generate_lead` fire again? (incident #10)
2. Move the trigger to a one-time custom event keyed by submission id.

## gads (CHK05: Google Ads / CRM outside 0.85–1.15)
1. Compare by **conversion date** and in the **account time zone** first.
2. Then walk the cascade: duplicates, spam, time zone (RECONCILIATION_METHOD.md).
3. A sudden drop with CRM leads still on /lp/ pages = attribution loss (incident #03), not a demand drop.

## lsa (CHK06: LSA / CRM outside 0.90–1.10)
1. Check the LSA → CRM integration is running.
2. Check the channel map: is "Google Local Services" still mapped to `lsa` for the lead's date?

## spam (CHK07: spam share > 10%)
1. Review the flagged queue (Lead audit page): reasons, bursts, domains.
2. Add rate limiting / a stronger honeypot on the form; never delete flagged leads, they stay linked and reasoned.

## dup (CHK08: duplicate share > 22%)
1. Is a form submitting twice (double click, retry)? Look for many "1 min earlier" reasons.
2. Is a call-tracking integration creating a second record for each form lead?

## sheet (CHK09: call-sheet labels < 98% standard)
1. The Apps Script audit colours the offending cells every morning.
2. Add data validation (dropdown) on the source column; the SQL normalization table maps the old variants.

## volume (CHK10: lead volume ≥ 1.7× the previous 4 weeks)
1. Did spam or duplicate checks fail the same days? Then it is a data issue: see spam / dup.
2. If they pass: look for a real cause (weather, promotion, outage of a competitor). With extreme weather, the check marks the day "explained" (incident #11): **do not correct it**.

## history (CHK11: a closed month changed)
1. Find the mapping or rule change since the snapshot (`core.channel_map_scd2`, `audit.rules.version`).
2. Never update a mapping in place: close the old version (`valid_to`) and insert a new one starting today.
3. Restore from `audit.kpi_snapshots` / `backups/<date>/` if a report was already sent.
