# Reconciliation method

*SIMULATED data. Platform rules: see PLATFORM_NOTES.md (two of them are modelled).*

Each platform counts something different from the CRM. Reconciling means converting one count into the other with **named, measured steps**, so that an unexplained gap is small and visible.

## 1. Compare like with like (`marts.reconciliation_daily`)

| System | Platform value | Comparable CRM value |
|---|---|---|
| Google Ads | conversions by conversion date, account time zone | CRM forms whose corrected channel is Google Ads, all statuses (the tag fires on every submission) |
| Meta Ads | leads reported (Pixel + CAPI, modelled view-through) | Meta leads, excluding duplicates and spam |
| Local Services Ads | leads in the LSA report | LSA leads, excluding duplicates |
| GA4 | `generate_lead` events | web-form submissions (not LSA, not Meta instant forms), excluding spam (bots rarely run analytics tags) |
| Call sheet | rows typed by staff | CRM calls (not LSA), excluding spam |

Every comparison uses the **brand's local day**. The UTC day is kept only to show the false gaps it creates (incident #06).

## 2. The Google Ads cascade (`marts.recon_cascade`)

Per brand and month, from the platform number to the CRM report:

1. **Platform conversions by click date**: what the Google Ads UI shows by default (modelled).
2. **Re-dated to the conversion day**: conversions whose click was in the previous month move.
3. **CRM vs tag**: submissions the tag missed (blocked, consent) minus conversions the tag counted that never reached the CRM. Small and stable; a jump means tracking broke (e.g. the PLMB·DAL redirect, incident #03).
4. **Duplicates removed**: the tag counts each resubmission.
5. **Spam & invalid removed**.
6. **Local day → UTC day**: what a CRM report in UTC shows.

The SQL test *"cascade adds up for every brand-month"* fails if the steps do not sum exactly.

## 3. Tolerances and checks
Ratios are judged on trailing windows (14 to 28 days) with bands set from normal noise: Google Ads 0.85–1.15, Meta 0.75–1.30, LSA 0.90–1.10, GA4 0.80–1.08 (checks CHK03 to CHK06). Outside the band, the check fails and links to the runbook.

## 4. Spend
LSA spend is reported **net of approved dispute credits** (modelled). Mart spend must equal the sum of the raw exports to the cent (`db/tests/integrity.sql`).

## 5. What is not reconciled
- Conversions modelled by the platforms (view-through, consent modelling) cannot be matched lead by lead; they show up as a stable ratio above 1.
- Calls not logged by staff and not tracked by a call-tracking number stay "Direct" (Inferred).
