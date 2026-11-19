// npm run export
// Writes small, aggregated JSON files for the static dashboard (web/public/data/) and the
// Looker Studio CSV (exports/looker_studio/). No personal data: lead ids only, no phones / e-mails.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, ROOT } from "./lib/db.ts";

const OUT = resolve(ROOT, "web/public/data");
mkdirSync(OUT, { recursive: true });
const db = await openDb();
const rows = async <T = Record<string, unknown>>(q: string) => (await db.query<T>(q)).rows;
const save = (name: string, data: unknown) => {
  writeFileSync(resolve(OUT, name), JSON.stringify(data));
  console.log(`  ${name.padEnd(22)} ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
};
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

// ---- reference lists (indexes used by the compact arrays below)
const brands = await rows<{ brand: string; trade: string; city: string; county: string; population_2025: number; tz: string }>(
  `SELECT brand, trade, city, county, population_2025, tz FROM core.brands ORDER BY brand`);
const channels = await rows<{ channel: string; label: string; is_paid: boolean }>(`SELECT channel, label, is_paid FROM core.channels ORDER BY sort`);
const dates = (await rows<{ d: string }>(`SELECT to_char(d, 'YYYY-MM-DD') d FROM generate_series(DATE '2025-05-01', DATE '2026-10-31', interval '1 day') d`)).map((r) => r.d);
const bi = Object.fromEntries(brands.map((b, i) => [b.brand, i]));
const ci = Object.fromEntries(channels.map((c, i) => [c.channel, i]));
const di = Object.fromEntries(dates.map((d, i) => [d, i]));

const checks = await rows<{ check_id: string; name: string; rule: string; threshold: string; window_days: number; runbook: string }>(
  `SELECT * FROM audit.checks ORDER BY check_id`);
save("meta.json", { brands, channels, dates, checks, generated: "2026-11-18" });

// ---- daily KPIs: [date, brand, channel, submissions, leads, qualified, spam, duplicates, invalid, booked, spend, spend_gross, credits, platform_leads, revenue]
const k = await rows<Record<string, string | number | Date>>(`SELECT * FROM marts.kpi_daily_brand ORDER BY date, brand, channel`);
save("daily.json", k.map((r) => [di[iso(r.date)], bi[r.brand as string], ci[r.channel as string], Number(r.submissions), Number(r.leads),
  Number(r.qualified), Number(r.spam), Number(r.duplicates), Number(r.invalid), Number(r.booked), Math.round(Number(r.spend)),
  Math.round(Number(r.spend_gross)), Math.round(Number(r.credits)), Number(r.platform_leads), Math.round(Number(r.revenue))]));

// ---- check results: one status string per check and brand (p=pass w=warn f=fail e=explained .=n/a)
const cr = await rows<{ check_id: string; brand: string; date: Date; status: string; observed: string | null; note: string | null }>(
  `SELECT check_id, brand, date, status, observed, note FROM audit.check_results ORDER BY check_id, brand, date`);
const code: Record<string, string> = { pass: "p", warn: "w", fail: "f", explained: "e", "n/a": "." };
const status: Record<string, Record<string, string[]>> = {};
const observed: Record<string, Record<string, (number | null)[]>> = {};
const notes: { check: string; brand: string; date: string; note: string }[] = [];
for (const r of cr) {
  const d = iso(r.date);
  status[r.check_id] ??= {}; observed[r.check_id] ??= {};
  status[r.check_id][r.brand] ??= Array(dates.length).fill(".");
  observed[r.check_id][r.brand] ??= Array(dates.length).fill(null);
  if (di[d] === undefined) continue;
  status[r.check_id][r.brand][di[d]] = code[r.status];
  observed[r.check_id][r.brand][di[d]] = r.observed === null ? null : Number(r.observed);
  if (r.note && r.status !== "n/a" && r.check_id !== "CHK11") notes.push({ check: r.check_id, brand: r.brand, date: d, note: r.note });
}
save("checks.json", {
  status: Object.fromEntries(Object.entries(status).map(([c, b]) => [c, Object.fromEntries(Object.entries(b).map(([k2, v]) => [k2, v.join("")]))])),
  observed, notes: notes.slice(-60),
});

// ---- incidents
save("incidents.json", (await rows(`SELECT * FROM audit.incidents ORDER BY incident_no`)).map((r) => ({ ...r, start_date: iso(r.start_date), end_date: iso(r.end_date) })));

// ---- lead audit: queue of flagged / borderline leads (most recent first), duplicate clusters, rule counts
const queue = await rows(`
  SELECT lead_id, brand, to_char(local_date, 'YYYY-MM-DD') date, status, round(spam_score, 2)::float score, reasons, corrected_channel channel, duplicate_of
  FROM marts.lead_facts WHERE status <> 'valid' OR spam_score >= 0.25 ORDER BY created_at DESC LIMIT 600`);
const clusters = await rows(`
  SELECT c.contact_id, c.brand, c.lead_count, json_agg(json_build_object('lead_id', l.lead_id, 'at', to_char(l.created_at AT TIME ZONE b.tz, 'YYYY-MM-DD HH24:MI'),
         'type', l.lead_type, 'status', s.status, 'reason', s.reasons[1]) ORDER BY l.created_at) AS leads
  FROM core.contacts c
  JOIN audit.lead_status s0 ON s0.lead_id = c.first_lead_id
  JOIN LATERAL (WITH RECURSIVE ch AS (SELECT c.first_lead_id AS lead_id UNION ALL
                SELECT x.lead_id FROM audit.lead_status x JOIN ch ON x.duplicate_of = ch.lead_id) SELECT lead_id FROM ch) m ON true
  JOIN core.leads l ON l.lead_id = m.lead_id JOIN audit.lead_status s ON s.lead_id = l.lead_id JOIN core.brands b ON b.brand = l.brand
  WHERE c.first_lead_id IN (SELECT DISTINCT ON (brand) first_lead_id FROM core.contacts WHERE lead_count >= 2 ORDER BY brand, lead_count DESC, first_lead_id DESC)
  GROUP BY c.contact_id, c.brand, c.lead_count ORDER BY c.contact_id DESC`);
const ruleCounts = await rows(`SELECT f.rule_id, r.flag_type, r.description, count(*)::int n FROM audit.lead_flags f JOIN audit.rules r USING (rule_id) GROUP BY 1, 2, 3 ORDER BY 2, 4 DESC`);
const der = (f: string) => JSON.parse(readFileSync(resolve(ROOT, "data/derived", f), "utf8"));
save("audit.json", { queue, clusters, ruleCounts, evaluation: der("evaluation.json"), spamModel: der("spam_model_eval.json") });

// ---- reconciliation: per system and brand, daily arrays (platform, CRM local day, CRM UTC day); monthly cascade
const rd = await rows<{ system: string; brand: string; date: Date; platform_value: number; crm_value: number; crm_value_utc: number }>(
  `SELECT system, brand, date, platform_value, crm_value, crm_value_utc FROM marts.reconciliation_daily`);
const recon: Record<string, Record<string, { p: number[]; c: number[]; u: number[] }>> = {};
for (const r of rd) {
  const i = di[iso(r.date)];
  if (i === undefined) continue;
  recon[r.system] ??= {};
  recon[r.system][r.brand] ??= { p: Array(dates.length).fill(0), c: Array(dates.length).fill(0), u: Array(dates.length).fill(0) };
  const o = recon[r.system][r.brand];
  o.p[i] = Number(r.platform_value); o.c[i] = Number(r.crm_value); o.u[i] = Number(r.crm_value_utc);
}
const cascade = (await rows(`SELECT * FROM marts.recon_cascade ORDER BY brand, month`)).map((r) => ({ ...r, month: iso(r.month).slice(0, 7) }));
save("recon.json", { recon, cascade });

// ---- attribution: Sankey raw -> corrected (per brand), monthly coverage, rule accuracy (from evaluation)
const sankey = await rows(`SELECT brand, coalesce(raw_channel, 'unmapped') AS raw, corrected_channel AS corrected, count(*)::int n
  FROM marts.lead_facts WHERE status <> 'spam' GROUP BY 1, 2, 3`);
const health = (await rows(`SELECT * FROM marts.attribution_health ORDER BY brand, month`)).map((r) => ({ ...r, month: iso(r.month).slice(0, 7) }));
const weeklyRaw = await rows(`SELECT brand, to_char(date_trunc('week', local_date), 'YYYY-MM-DD') week,
  count(*) FILTER (WHERE raw_channel = 'direct')::int raw_direct, count(*) FILTER (WHERE raw_channel = 'google_ads')::int raw_gads,
  count(*) FILTER (WHERE corrected_channel = 'direct')::int cor_direct, count(*) FILTER (WHERE corrected_channel = 'google_ads')::int cor_gads,
  count(*)::int total
  FROM marts.lead_facts WHERE status <> 'spam' AND lead_type = 'form' GROUP BY 1, 2 ORDER BY 1, 2`);
const rules = await rows(`SELECT attribution_rule rule, confidence, count(*)::int n FROM marts.lead_facts WHERE status <> 'spam' GROUP BY 1, 2 ORDER BY 3 DESC`);
const history = await rows(`SELECT to_char(month, 'YYYY-MM') AS month, channel, sum(snapshot)::int snapshot, sum(recomputed_naive)::int naive
  FROM marts.history_check WHERE channel IN ('lsa', 'gbp', 'google_ads') GROUP BY 1, 2 ORDER BY 1, 2`);
const mapRows = (await rows(`SELECT source_label, match_type, channel, priority, version, valid_from, valid_to, change_note FROM core.channel_map_scd2 ORDER BY version, priority, source_label`))
  .map((r) => ({ ...r, valid_from: iso(r.valid_from), valid_to: r.valid_to ? iso(r.valid_to) : null }));
save("attribution.json", { sankey, health, weeklyRaw, rules, history, channelMap: mapRows, ga4: der("ga4_public.json") });

// ---- weather (PUBLIC DATA) for annotations: daily max temperature and rain per brand
const w = await rows<{ brand: string; date: Date; tmax: string; precip: string }>(`SELECT brand, date, tmax, precip FROM core.weather_daily ORDER BY brand, date`);
const weather: Record<string, { t: number[]; r: number[] }> = {};
for (const r of w) {
  const i = di[iso(r.date)];
  weather[r.brand] ??= { t: Array(dates.length).fill(null), r: Array(dates.length).fill(null) };
  weather[r.brand].t[i] = Math.round(Number(r.tmax) * 10) / 10; weather[r.brand].r[i] = Math.round(Number(r.precip) * 10) / 10;
}
save("weather.json", weather);

// ---- totals used by the cover page and the PDF
const totals = (await rows(`SELECT count(*)::int submissions, count(*) FILTER (WHERE status = 'valid')::int qualified,
  (SELECT count(*)::int FROM audit.lead_flags) flags, (SELECT count(*)::int FROM audit.check_results WHERE status <> 'n/a') check_runs
  FROM marts.lead_facts`))[0];
save("totals.json", totals);

// ---- Looker Studio: one flat CSV of the daily mart (connect it through Google Sheets)
mkdirSync(resolve(ROOT, "exports/looker_studio"), { recursive: true });
const head = "date,brand,channel,submissions,leads,qualified,spam,duplicates,invalid,booked,spend_net,spend_gross,lsa_credits,platform_leads";
const csv = k.map((r) => [iso(r.date), r.brand, r.channel, r.submissions, r.leads, r.qualified, r.spam, r.duplicates, r.invalid, r.booked,
  Number(r.spend).toFixed(2), Number(r.spend_gross).toFixed(2), Number(r.credits).toFixed(2), r.platform_leads].join(","));
writeFileSync(resolve(ROOT, "exports/looker_studio/kpi_daily_brand.csv"), [head, ...csv].join("\n") + "\n");
if (existsSync(resolve(ROOT, "data/derived/ga4_public.json"))) copyFileSync(resolve(ROOT, "data/derived/ga4_public.json"), resolve(OUT, "ga4_public.json"));
await db.close();
