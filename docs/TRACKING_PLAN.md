# Tracking plan

*Design document for the five fictional brands' websites; demonstrated on the `/lab` page (no live container, no tag sent).*

## Events

| Event | Where | Trigger | Parameters | Destinations |
|---|---|---|---|---|
| `page_view` | every page | GTM page view | page_location, page_referrer | GA4 |
| `form_start` | quote / contact form | first field focus | form_id | GA4 |
| `generate_lead` | form submit (success) | custom dataLayer event, **once per submission** | form_id, event_id, submission_id, brand | GA4, Google Ads conversion, Meta Pixel `Lead` |
| `call_click` | tap on the phone number | link click `tel:` | brand, page | GA4 |
| `Lead` (server) | backend, after the CRM accepted the lead | webhook / server container | event_id (same as browser), hashed e-mail and phone | Meta Conversions API, Google Ads (enhanced conversions for leads) |

## Parameters captured on landing (`integrations/tracking-lab/capture.js`)

| Parameter | Kept | Sent with the form as |
|---|---|---|
| utm_source, utm_medium, utm_campaign, utm_term, utm_content | 90 days, first and last touch | hidden fields |
| gclid | 90 days (last ad click wins) | hidden field `gclid` → offline conversion import |
| fbclid | 90 days | hidden field `fbclid` |
| landing_page | with the touch | hidden field |

Why first-party storage: a redirect or a second visit without parameters (incident #03) no longer loses the click.

## Rules
- **One conversion per submission**: the dataLayer push happens once per `submission_id` (flag in sessionStorage); reloading the thank-you page does nothing (incident #10).
- **One event_id per lead**, generated in the browser, sent with the form, reused by the server for the Conversions API. Meta deduplicates a browser and a server event when `event_id` and `event_name` match, within 48 hours (official documentation, read 2026-11-18) (incident #05).
- **GCLID always captured**: hidden field on every form template; a deploy check fails if a template lacks it (incident #04).

## Consent
- Consent banner before any marketing tag; Google consent mode signals (ad_storage, analytics_storage, ad_user_data, ad_personalization) set from the banner.
- Without consent: no attribution storage beyond the session, no Pixel; the server event is sent only if the lead's consent allows it.
- Hashing (SHA-256 of normalized e-mail and E.164 phone) happens server-side; raw contact details never go to ad platforms.

## Naming
snake_case event and parameter names; brand codes as in the CRM (`HVAC-PHX`…); one GTM container per site, one server container shared.
