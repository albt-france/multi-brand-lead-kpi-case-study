# Platform rules used in this project, and where they come from

Official pages were read on 2026-11-18. Where a page could not be read, the rule is labelled **modelled** and phrased cautiously.

| Rule used | Status | Source |
|---|---|---|
| Meta deduplicates a Pixel event and a Conversions API event when the Pixel `eventID` equals the CAPI `event_id` **and** the event names match; a duplicate is dropped only if it arrives within 48 hours of the first one. | Verified | [Meta: Deduplicate Pixel and server events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events) |
| Offline conversion import from ad clicks needs the GCLID of the click that led to the lead, plus the conversion action, the conversion time with time zone, and an optional value. Enhanced conversions for leads use hashed user data (e-mail / phone) from the lead form and can work with or without the GCLID. | Verified | [Google Ads Help: import conversions from ad clicks (legacy page, points to Data Manager)](https://support.google.com/google-ads/answer/7014069) |
| A server-side Tag Manager container runs on a server you control, receives requests from devices and processes them with tags, triggers and variables (Stape is a hosting provider for such containers). | Verified | [Google: server-side tagging introduction](https://developers.google.com/tag-platform/tag-manager/server-side/intro) |
| Supabase row-level security policies use `auth.uid()` and are scoped `TO authenticated`. | Verified | [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| Google Ads "Conversions" are counted against the date of the ad interaction, and a separate "by conversion time" view exists. | **Modelled**: the help page could not be read (404). The simulation exports both columns; check them in a real account before relying on the cascade's first step. | n/a |
| Local Services Ads lets advertisers dispute charged leads and credits approved disputes back. | **Modelled**: the help page could not be read (404). The simulation treats credits as a separate column; confirm the account's billing report before use. | n/a |

The simulated exports follow these rules; nothing in this repository was run against a live Google Ads, Meta, LSA, GoHighLevel or Stape account.
