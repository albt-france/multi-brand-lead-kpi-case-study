// "Trace": where each KPI comes from. Source -> transformations -> checks passed -> value.
// The steps name the real files and tables of the repository.
export type Step = { kind: "Source" | "Transform" | "Rule" | "Check" | "Value"; what: string; detail?: string; code?: string; checks?: string[] };

export const LINEAGE: Record<string, { title: string; definition: string; steps: Step[] }> = {
  leads: {
    title: "Leads",
    definition: "Unique leads: every CRM record except duplicates of an earlier lead of the same brand (30-day window).",
    steps: [
      { kind: "Source", what: "CRM export (GoHighLevel format, UTC)", code: "raw.crm_contacts" },
      { kind: "Transform", what: "Typed, local day per brand time zone, phone to E.164", code: "db/transforms/10_core.sql → core.leads" },
      { kind: "Rule", what: "Spam scored first, then duplicates among non-spam leads", code: "db/audit/10_spam.sql, 20_duplicates.sql" },
      { kind: "Transform", what: "One verdict per lead: spam > duplicate > invalid > valid", code: "db/audit/40_status.sql → audit.lead_status" },
      { kind: "Check", what: "Duplicate share and spam share inside their bands", checks: ["CHK08", "CHK07"] },
      { kind: "Value", what: "Sum of leads in the mart for the selected filters", code: "marts.kpi_daily_brand.leads" },
    ],
  },
  qualified: {
    title: "Qualified leads",
    definition: "Leads that are not spam, not duplicates and have a reachable US phone / valid e-mail.",
    steps: [
      { kind: "Source", what: "CRM export", code: "raw.crm_contacts" },
      { kind: "Transform", what: "Phone normalized with libphonenumber (TypeScript)", code: "scripts/db_build.ts → staging.phone_norm" },
      { kind: "Rule", what: "Spam (honeypot, disposable domain, bursts, foreign phone, text score)", code: "db/audit/10_spam.sql" },
      { kind: "Rule", what: "Duplicates and invalid contact details", code: "db/audit/20_duplicates.sql, 30_invalid.sql" },
      { kind: "Check", what: "Spam, duplicates, volume anomaly (weather-aware)", checks: ["CHK07", "CHK08", "CHK10"] },
      { kind: "Value", what: "status = 'valid'", code: "marts.kpi_daily_brand.qualified" },
    ],
  },
  spend: {
    title: "Spend",
    definition: "Google Ads cost + Meta amount spent + Local Services Ads charges net of approved dispute credits.",
    steps: [
      { kind: "Source", what: "Google Ads, Meta Ads and LSA exports (account time zone)", code: "raw.google_ads_daily, raw.meta_ads_daily, raw.lsa_leads" },
      { kind: "Transform", what: "LSA: gross charges minus approved credits", code: "db/transforms/10_core.sql → core.spend_daily.net_cost" },
      { kind: "Check", what: "Mart spend reconciles to the raw exports to the cent", code: "db/tests/integrity.sql" },
      { kind: "Value", what: "Sum of net spend", code: "marts.kpi_daily_brand.spend" },
    ],
  },
  cpl: {
    title: "Cost per lead",
    definition: "Paid spend / leads from paid channels (Google Ads, LSA, Meta), after attribution correction.",
    steps: [
      { kind: "Source", what: "Spend (net) and leads per corrected channel", code: "core.spend_daily, core.touches" },
      { kind: "Rule", what: "Attribution priority: integration → gclid → fbclid → UTM → landing page → referrer → call log", code: "db/audit/50_attribution.sql" },
      { kind: "Check", what: "Platform vs CRM within tolerance", checks: ["CHK03", "CHK05", "CHK06"] },
      { kind: "Value", what: "spend / paid leads", code: "web/lib/metrics.ts" },
    ],
  },
  cpql: {
    title: "Cost per qualified lead",
    definition: "Paid spend / qualified leads from paid channels.",
    steps: [
      { kind: "Source", what: "Spend (net) and qualified leads per corrected channel", code: "core.spend_daily, audit.lead_status" },
      { kind: "Rule", what: "Audit verdicts and corrected attribution", code: "db/audit/*.sql" },
      { kind: "Check", what: "Reconciliation and spam checks", checks: ["CHK03", "CHK05", "CHK06", "CHK07"] },
      { kind: "Value", what: "spend / paid qualified leads", code: "web/lib/metrics.ts" },
    ],
  },
  trust: {
    title: "Data Trust Score",
    definition: "Share of automated checks passing in the period (pass or explained = 1, warn = ½, fail = 0).",
    steps: [
      { kind: "Source", what: "11 automated checks, one result per brand and day", code: "audit.check_results" },
      { kind: "Transform", what: "Trailing windows (7-28 days) so small counts do not alarm", code: "db/transforms/60_checks.sql" },
      { kind: "Check", what: "History protected: closed months unchanged", checks: ["CHK11"] },
      { kind: "Value", what: "Weighted pass rate × 100", code: "web/lib/metrics.ts checkScore()" },
    ],
  },
};
