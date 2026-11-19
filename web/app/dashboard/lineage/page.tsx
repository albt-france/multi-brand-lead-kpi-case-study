"use client";
// 07 Lineage & methods: data flow, data dictionary, sources and licences, limits.
import { Card, PageHead } from "@/components/ui";
import Flow from "@/components/Flow";

const DICT: [string, string, string][] = [
  ["raw.crm_contacts", "1 row per CRM record", "lead_id, brand, created_at_utc, attribution_source, utm_*, gclid, fbclid, phone, email, message, honeypot"],
  ["raw.webhook_events", "1 row per delivery", "dedup_key (unique), payload jsonb, received_at"],
  ["core.leads", "1 row per CRM record, typed", "local_date, utc_date, phone_e164, phone_valid, email_norm"],
  ["core.contacts", "1 row per person", "first_lead_id, lead_count"],
  ["core.touches", "1 row per lead", "raw_channel, corrected_channel, rule, confidence (Verified / Inferred), map_version"],
  ["core.spend_daily", "brand × day × paid channel", "gross_cost, credits, net_cost, platform_leads"],
  ["core.channel_map_scd2", "1 row per label version", "source_label, match_type, channel, priority, valid_from, valid_to"],
  ["audit.lead_flags", "1 row per lead × rule fired", "rule_id, rule_version, score, reason, related_lead_id"],
  ["audit.lead_status", "1 row per lead", "status (spam > duplicate > invalid > valid), spam_score, reasons[]"],
  ["audit.check_results", "check × brand × day", "observed, status (pass / warn / fail / explained / n/a)"],
  ["audit.kpi_snapshots", "month × brand × channel × metric", "value frozen at month close, map_version"],
  ["marts.kpi_daily_brand", "local day × brand × channel", "submissions, leads, qualified, spam, duplicates, booked, spend"],
  ["marts.reconciliation_daily", "system × brand × day", "platform_value, crm_value (local day), crm_value_utc"],
];

const SOURCES: [string, string, string][] = [
  ["Open-Meteo Archive API", "Daily weather of the five cities: drives demand, explains the false alarm", "CC BY 4.0"],
  ["US Census Bureau, county estimates 2025", "Market size, leads per 10,000 residents", "Public domain"],
  ["Google GA4 obfuscated sample (Google Merchandise Store), Hugging Face mirror", "Real attribution-health panel", "Google sample data; mirror MIT"],
  ["disposable-email-domains", "Spam rule: disposable inboxes", "CC0 1.0"],
  ["UCI SMS Spam Collection", "Text classifier training and held-out evaluation", "CC BY 4.0"],
  ["Meta, Google Ads, Google tag platform, Supabase documentation", "Platform rules (read 2026-11-18; two pages unavailable, rules marked modelled)", "Cited, not reproduced"],
];

export default function Lineage() {
  return (
    <div className="content">
      <PageHead eyebrow="07 · Lineage & methods" title="Where every number comes from, and what it cannot tell you"
        lede="Five layers, one schema each. Raw data is never edited; every transformation is a SQL file; every KPI on the dashboard reads a mart view. The “Trace” drawer on each KPI follows this same path." />
      <div className="grid">
        <Card span={12} id="flow" title="Data flow">
          <div style={{ overflowX: "auto" }}><Flow /></div>
          <p className="card-sub">Tracking path (design, no live container): browser → GTM web container → server container (e.g. hosted on Stape) → GA4, Google Ads, Meta Conversions API, with one shared event_id for deduplication. See docs/SERVER_SIDE_TRACKING.md.</p>
        </Card>
        <Card span={7} id="dict" title="Data dictionary (main tables)" sub="Full dictionary with every column: docs/DATA_DICTIONARY.md.">
          <div className="tablewrap"><table>
            <thead><tr><th>Table</th><th>Grain</th><th>Key columns</th></tr></thead>
            <tbody>{DICT.map(([t, g, c]) => <tr key={t}><td className="mono" style={{ whiteSpace: "nowrap" }}>{t}</td><td>{g}</td><td className="ink2">{c}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card span={5} id="defs" title="KPI definitions" sub="Same definitions in SQL, in the dashboard and in docs/KPI_DEFINITIONS.md.">
          <ul className="qlist" style={{ fontSize: 13 }}>
            <li><b>Submissions</b>every CRM record.</li>
            <li><b>Leads</b>submissions minus duplicates (same normalized phone or e-mail, same brand, 30 days).</li>
            <li><b>Qualified leads</b>leads minus spam and invalid contact details.</li>
            <li><b>Spend</b>Google Ads cost + Meta amount spent + LSA charges net of approved credits.</li>
            <li><b>Cost per (qualified) lead</b>paid spend / (qualified) leads of paid channels, corrected attribution.</li>
            <li><b>Day</b>the brand&apos;s local calendar day (UTC kept for audit).</li>
            <li><b>Data Trust Score</b>check runs passing in the period: pass or explained = 1, warn = ½, fail = 0.</li>
          </ul>
        </Card>
        <Card span={7} id="sources" title="Sources and licences">
          <div className="tablewrap"><table>
            <thead><tr><th>Source</th><th>Used for</th><th>Licence</th></tr></thead>
            <tbody>{SOURCES.map(([s, u, l]) => <tr key={s}><td>{s}</td><td className="ink2">{u}</td><td style={{ whiteSpace: "nowrap" }}>{l}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card span={5} id="limits" title="Limits">
          <ul className="qlist" style={{ fontSize: 13 }}>
            <li><b>Simulated</b>brands, platforms, leads and incidents are fictional; the method is the point, not the numbers.</li>
            <li><b>No live platform</b>Google Ads, Meta, LSA, GoHighLevel and Stape are simulated by realistic exports; integration code runs against fixtures and is ready for real credentials.</li>
            <li><b>Modelled rules</b>Google Ads click-date reporting and LSA credits could not be checked in the official help (pages unavailable).</li>
            <li><b>Answer key</b>precision / recall are measured against the simulation&apos;s own hidden truth, which a real business does not have: there, a reviewed sample replaces it.</li>
            <li><b>Phones</b>fictional 555-0100–0199 lines; area codes do not reflect geography.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
