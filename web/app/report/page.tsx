"use client";
// Printable 8-page report (A4 landscape). `npm run pdf` prints this page with headless Edge to report/lead-kpi-case-study.pdf.
// Same tokens, components and data as the dashboard; light theme forced for print.
import { useEffect } from "react";
import { DataProvider, useData } from "@/lib/data";
import { filterRows, totals, COL, series } from "@/lib/metrics";
import { n0, pct, usd, monthLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import Flow from "@/components/Flow";
import { FOOTER } from "@/components/brand";
import "./report.css";

const SITE = "https://albt-france.github.io/multi-brand-lead-kpi-case-study/";

export default function Report() {
  useEffect(() => { document.documentElement.setAttribute("data-theme", "light"); }, []);
  return <DataProvider><Pages /></DataProvider>;
}

function Page({ n, title, tag, children }: { n: number; title: string; tag?: "sim" | "public" | "mixed"; children: React.ReactNode }) {
  return (
    <section className="rpage">
      <header className="rhead">
        <span className="eyebrow">Page {n} · Lead KPI case study</span>
        {tag && <span className={`tag ${tag === "public" ? "public" : "sim"}`}>{tag === "mixed" ? "Simulated + public data" : tag === "public" ? "Public data" : "Simulated"}</span>}
      </header>
      <h1>{title}</h1>
      <div className="rbody">{children}</div>
      <footer className="rfoot"><span>{FOOTER}</span><span>{n + 1} / 8</span></footer>
    </section>
  );
}

function Pages() {
  const { data } = useData();
  if (!data) return <p style={{ padding: 40 }}>Loading…</p>;
  const d = data;
  const all: [number, number] = [0, d.meta.dates.length - 1];
  const t = totals(d, filterRows(d, { brand: "ALL", period: "all", channel: "ALL" }, all));
  const ev = d.audit.evaluation, sm = d.audit.spamModel;
  const cls = (c: string) => ev.classes.find((x: { class: string }) => x.class === c);
  const casc = (d.recon.cascade as Record<string, number | string>[]).reduce<Record<string, number>>((a, r) => {
    for (const k of Object.keys(r)) if (k !== "brand" && k !== "month") a[k] = (a[k] ?? 0) + Number(r[k]);
    return a;
  }, {});
  const inc = (n: number) => d.incidents.find((i) => i.incident_no === n)!;
  const ga4 = d.attribution.ga4;

  return (
    <div className="report">
      {/* 0 · Overview */}
      <Page n={0} title="One source of truth for leads: auditing, attributing and reconciling five local-service brands" tag="mixed">
        <p className="lede">A multi-brand US local-services group (fictional; sector inferred from the role description) runs five brands on Google Ads, Local Services Ads, Meta and a CRM. This project rebuilds the chain in PostgreSQL (Supabase format) and proves every number: each lead audited, its attribution corrected, every platform reconciled against the CRM, history protected.</p>
        <div className="rgrid4">
          <div className="rkpi"><div className="eyebrow">Lead audit</div><div className="bigkpi">{n0(t.submissions)}</div><p>submissions audited; {n0(t.qualified)} are real, reachable leads ({pct(t.qualified / t.submissions, 0)})</p></div>
          <div className="rkpi"><div className="eyebrow">Data quality</div><div className="bigkpi">12</div><p>hidden incidents traced to a root cause and quantified; one is a false alarm left uncorrected</p></div>
          <div className="rkpi"><div className="eyebrow">Attribution</div><div className="bigkpi">{pct(ev.attribution.corrected_accuracy)}</div><p>of leads on the right channel after correction (CRM label alone: {pct(ev.attribution.raw_accuracy)})</p></div>
          <div className="rkpi"><div className="eyebrow">Reconciliation</div><div className="bigkpi">{n0(casc.platform_click_date)} → {n0(casc.crm_report)}</div><p>Google Ads conversions to CRM qualified leads, every step measured</p></div>
        </div>
        <div className="rgrid2">
          <div className="rcard"><h2>What was built</h2><ul>
            <li>PostgreSQL schema in Supabase format: raw → staging → core → audit → marts, RLS example, run and tested in PGlite.</li>
            <li>One SQL audit rule per file with readable reasons; attribution priority rules; versioned channel map (SCD2) and monthly snapshots.</li>
            <li>11 automated checks, a runbook, an incident log computed in SQL.</li>
            <li>Webhook intake (Supabase Edge Function format), tracking capture with a shared event_id, Apps Script sheet audit, all tested on fixtures.</li>
            <li>A 7-page Next.js dashboard with a “Trace” lineage drawer on every KPI.</li>
          </ul></div>
          <div className="rcard"><h2>Live dashboard</h2><p className="mono">{SITE}</p><p className="muted">Repository: code, SQL, tests and documents. Simulated data except where marked PUBLIC DATA.</p></div>
        </div>
      </Page>

      {/* 1 · Brief */}
      <Page n={1} title="The brief, point by point: each block of the role has a working answer">
        <table className="rtable">
          <thead><tr><th>Block of the brief</th><th>Where it is handled</th></tr></thead>
          <tbody>
            <tr><td><b>Dashboards & reporting</b>: multi-brand KPIs, cost per lead, discrepancies, automated reports and checks</td><td>Dashboard (Overview, Channels & spend), <span className="mono">marts.kpi_daily_brand</span>, Data Trust Score, 11 checks, weekly report design (AUTOMATIONS.md), Looker Studio CSV and recipe</td></tr>
            <tr><td><b>Lead auditing & attribution</b>: duplicates, spam, invalid; UTM / GCLID; reconciliation CRM / platforms / sheets; exact history</td><td><span className="mono">db/audit/*.sql</span> (readable reasons), attribution priority rules, reconciliation cascade, call sheet normalization, SCD2 channel map + snapshots (CHK11)</td></tr>
            <tr><td><b>Databases</b>: SQL, Supabase / PostgreSQL, pipelines, integrity, documentation, backups</td><td>Migrations, RLS example, integrity assertions, generated data dictionary, dated CSV backups with manifest</td></tr>
            <tr><td><b>Tracking & integrations</b>: GTM, GA4, Google Ads, Stape / server-side GTM, Meta Pixel + CAPI</td><td>Tracking plan, server-side design, capture snippet with shared event_id (tested, live demo page /lab), real GA4 sample analysis</td></tr>
            <tr><td><b>Automation & AI</b>: APIs, webhooks, Zapier, audits, cleaning, automated reports; tested code</td><td>Idempotent webhook intake, Apps Script daily audit, 3 automation designs, text classifier evaluated on a real held-out set, Vitest + pytest + SQL tests, CI rebuild from public sources</td></tr>
          </tbody>
        </table>
        <p className="muted">Skills shown: SQL (CTEs, window functions, DISTINCT ON, jsonb, recursive CTE, RLS), TypeScript, Next.js, Apps Script, Python, GitHub Actions.</p>
      </Page>

      {/* 2 · Architecture */}
      <Page n={2} title="Architecture: five layers, every step a SQL file, every KPI traceable">
        <Flow />
        <div className="rgrid3">
          <div className="rcard"><h2>raw → core</h2><p>Exports land as text, untouched. Phones are normalized to E.164 (libphonenumber), each lead gets a local day and a UTC day.</p></div>
          <div className="rcard"><h2>audit</h2><p>Rules write one flag per lead with a reason and a rule version; one verdict per lead; daily checks; monthly snapshots; incident log.</p></div>
          <div className="rcard"><h2>Integrations</h2><p>Browser → GTM web → server container (e.g. Stape) → GA4, Google Ads, Meta CAPI with one event_id. Webhooks land idempotently in Supabase. Design only, no live container.</p></div>
        </div>
      </Page>

      {/* 3 · Lead audit */}
      <Page n={3} title={`Lead audit: ${pct(t.duplicates / t.submissions)} duplicates, ${pct(t.spam / t.submissions)} spam, ${pct(t.invalid / t.submissions)} invalid, each with a reason`} tag="mixed">
        <div className="rgrid2">
          <div className="rcard">
            <h2>Verdicts and detection quality <span className="tag sim">Simulated</span></h2>
            <table className="rtable"><thead><tr><th>Verdict</th><th className="num">Records</th><th className="num">Precision</th><th className="num">Recall</th></tr></thead>
              <tbody>
                <tr><td>Duplicate</td><td className="num">{n0(t.duplicates)}</td><td className="num">{pct(cls("duplicate").precision)}</td><td className="num">{pct(cls("duplicate").recall)}</td></tr>
                <tr><td>Spam</td><td className="num">{n0(t.spam)}</td><td className="num">{pct(cls("spam").precision)}</td><td className="num">{pct(cls("spam").recall)}</td></tr>
                <tr><td>Invalid</td><td className="num">{n0(t.invalid)}</td><td className="num">{pct(cls("invalid").precision)}</td><td className="num">{pct(cls("invalid").recall)}</td></tr>
              </tbody></table>
            <p>Scored against the simulation&apos;s hidden answer key. Missed duplicates are people who came back with another phone and another e-mail; missed spam has a single weak signal, kept below the threshold on purpose to protect real customers.</p>
            <p className="muted">Example reasons: “same phone as lead_025831, 4 h earlier” · “4 submissions in 3 min from one address” · “disposable domain” · “area code (485) not in service”.</p>
          </div>
          <div className="rcard">
            <h2>Text classifier <span className="tag public">Public data</span></h2>
            <p>TF-IDF + logistic regression trained on the UCI SMS Spam Collection (5,574 labelled messages, CC BY 4.0), evaluated on a held-out 20% test set: <b>precision {pct(sm.precision)}, recall {pct(sm.recall)}</b>, ROC AUC {sm.roc_auc} ({sm.tp} spam caught, {sm.fp} false alarms, {sm.fn} missed).</p>
            <p>Limit: SMS are not web forms, so the score is only a secondary signal (weight 0.25) on the form message.</p>
            <WeeklyFlags />
          </div>
        </div>
      </Page>

      {/* 4 · Attribution */}
      <Page n={4} title={`Attribution health: right channel for ${pct(ev.attribution.corrected_accuracy)} of leads after correction, ${pct(ev.attribution.raw_accuracy)} before`} tag="mixed">
        <div className="rgrid2">
          <div className="rcard"><h2>GCLID coverage fell after a form update (#04) <span className="tag sim">Simulated</span></h2><Coverage /></div>
          <div className="rcard"><h2>A redirect turned paid search into “Direct” (#03) <span className="tag sim">Simulated</span></h2><Redirect /><p className="muted">{inc(3).evidence}.</p></div>
        </div>
        <div className="rcard"><h2>Real GA4 data: only {pct(ga4.session_source_buckets["Attributed source"], 0)} of sessions carry a usable source <span className="tag public">Public data</span></h2>
          <p>Google&apos;s obfuscated GA4 sample ({n0(ga4.sessions)} sessions, e-commerce, not lead-gen): {pct(ga4.session_source_buckets["No source on any page_view"], 0)} with no source, {pct(ga4.session_source_buckets["Self-referral (own domain)"], 1)} self-referral, {pct(ga4.first_touch_vs_session_source_mismatch, 0)} with a session source different from the first visit. The same failure modes are fixed on the simulated leads.</p></div>
      </Page>

      {/* 5 · Reconciliation */}
      <Page n={5} title={`Reconciliation: Google Ads ${n0(casc.platform_click_date)} conversions → CRM ${n0(casc.crm_report)} qualified leads, step by step`} tag="sim">
        <div className="rgrid2">
          <div className="rcard"><h2>The cascade (all brands, 18 months)</h2><Cascade c={casc} /><p className="muted">Click-date reporting is modelled (see PLATFORM_NOTES.md).</p></div>
          <div className="rcard"><h2>Meta / CRM before and after a shared event_id (#05, #12)</h2><MetaRatio /><p className="muted">{inc(5).evidence}; {inc(12).evidence.toLowerCase()}.</p></div>
        </div>
        <div className="rgrid3">
          <div className="rcard"><h2>Time zones (#06)</h2><p>{inc(6).evidence}. KPIs use the brand&apos;s local day.</p></div>
          <div className="rcard"><h2>LSA credits (#08)</h2><p>{inc(8).evidence}. {inc(8).impact}.</p></div>
          <div className="rcard"><h2>GA4 double count (#10)</h2><p>{inc(10).evidence}. Trigger moved to a one-time event.</p></div>
        </div>
      </Page>

      {/* 6 · Incidents */}
      <Page n={6} title="Twelve incidents, one false alarm: the heat wave is real demand, not a bug" tag="sim">
        <table className="rtable small">
          <thead><tr><th>#</th><th>Incident</th><th>Brand</th><th>Evidence</th><th>Status</th></tr></thead>
          <tbody>{d.incidents.map((i) => (
            <tr key={i.incident_no} className={i.kind === "false_signal" ? "hl" : ""}><td className="incno">#{String(i.incident_no).padStart(2, "0")}</td><td><b>{i.title}</b></td><td>{i.brand.replace("-", "·")}</td><td>{i.evidence}</td><td>{i.kind === "false_signal" ? "Not a data issue" : i.status}</td></tr>
          ))}</tbody>
        </table>
        <p className="muted">History is protected: {inc(7).impact.toLowerCase()} (#07). All figures computed in SQL (db/transforms/80_incident_log.sql).</p>
      </Page>

      {/* 7 · Methods */}
      <Page n={7} title="Methods, limits and sources">
        <div className="rgrid2">
          <div className="rcard"><h2>Sources and licences (retrieved 2026-11-18)</h2><ul>
            <li>Open-Meteo Archive API: daily weather of the five cities (CC BY 4.0).</li>
            <li>US Census Bureau county population estimates 2025 (public domain).</li>
            <li>Google GA4 obfuscated sample, via the Hugging Face mirror gizdevans/ga4-bq-flattened-data (Google sample data; mirror MIT).</li>
            <li>disposable-email-domains list (CC0 1.0); UCI SMS Spam Collection (CC BY 4.0).</li>
            <li>Official documentation of Meta, Google Ads, Google tag platform and Supabase, read 2026-11-18; two rules could not be checked and are marked modelled.</li>
            <li>Code libraries: Next.js, ECharts, PGlite, libphonenumber-js (MIT / Apache-2.0); Inter font (OFL).</li>
          </ul></div>
          <div className="rcard"><h2>Assumptions and limits</h2><ul>
            <li>Brands, platforms, leads and incidents are simulated (seed 42); weather and population are real.</li>
            <li>No live access to Google Ads, Meta, LSA, GoHighLevel or Stape: realistic exports and fixtures; integration code is ready for real credentials.</li>
            <li>Precision and recall use the simulation&apos;s answer key; a real business would use a reviewed sample.</li>
            <li>Phones are fictional 555-0100–0199 lines; the classifier is trained on SMS, not forms.</li>
          </ul>
            {/* The methods note is read from the README by scripts/build_pdf.ts and exists only in the PDF build. */}
            {process.env.NEXT_PUBLIC_METHODS_NOTE ? (<>
              <h2 style={{ marginTop: 10 }}>Methods</h2>
              <p>{process.env.NEXT_PUBLIC_METHODS_NOTE}</p>
            </>) : null}
          </div>
        </div>
      </Page>
    </div>
  );
}

function WeeklyFlags() {
  const { data } = useData();
  const d = data!;
  const rows = filterRows(d, { brand: "ALL", period: "all", channel: "ALL" }, [0, d.meta.dates.length - 1]);
  const m = (c: number) => series(d, rows, c, "month");
  const dup = m(COL.duplicates), spam = m(COL.spam), inv = m(COL.invalid);
  return <Chart height={170} label="Excluded submissions per month by reason" option={(tk) => {
    const bs = base(tk);
    return { ...bs, animation: false, grid: { left: 36, right: 6, top: 24, bottom: 20 }, legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: tk.ink2, fontSize: 10 } },
      xAxis: bs.xAxis({ type: "category", data: dup.map((x) => monthLabel(x[0])) }), yAxis: bs.yAxis({ type: "value" }),
      series: [["Duplicates", dup, tk.info], ["Spam", spam, tk.signal], ["Invalid", inv, tk.attention]].map(([n, s, c]) => ({ name: n, type: "bar", stack: "x", data: (s as [string, number][]).map((x) => x[1]), itemStyle: { color: c } })) };
  }} />;
}

function Coverage() {
  const { data } = useData();
  const h = data!.attribution.health as { month: string; paid_search_with_utm: number; paid_search_with_gclid: number }[];
  const by = new Map<string, [number, number]>();
  for (const r of h) { const o = by.get(r.month) ?? [0, 0]; o[0] += Number(r.paid_search_with_gclid); o[1] += Number(r.paid_search_with_utm); by.set(r.month, o); }
  const m = [...by.entries()].sort();
  return <Chart height={190} label="Monthly GCLID coverage" option={(tk) => {
    const bs = base(tk);
    return { ...bs, animation: false, grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: bs.xAxis({ type: "category", data: m.map((x) => monthLabel(x[0])), boundaryGap: false }),
      yAxis: bs.yAxis({ type: "value", min: 0, max: 1, axisLabel: { ...bs.font, formatter: (v: number) => `${v * 100}%` } }),
      series: [{ type: "line", data: m.map((x) => x[1][0] / x[1][1]), symbolSize: 5, lineStyle: { width: 2, color: tk["ch-google_ads"] }, itemStyle: { color: tk["ch-google_ads"] },
        markLine: { silent: true, symbol: "none", lineStyle: { color: tk.ink3, type: [4, 3] }, label: { color: tk.ink3, fontSize: 10, formatter: "check: 80%" }, data: [{ yAxis: 0.8 }] } }] };
  }} />;
}

function Redirect() {
  const { data } = useData();
  const w = (data!.attribution.weeklyRaw as { brand: string; week: string; raw_direct: number; cor_direct: number }[]).filter((x) => x.brand === "PLMB-DAL" && x.week >= "2025-12-01" && x.week <= "2026-05-31");
  return <Chart height={170} label="PLMB-DAL weekly Direct leads, CRM label vs corrected" option={(tk) => {
    const bs = base(tk);
    return { ...bs, animation: false, grid: { left: 30, right: 10, top: 24, bottom: 20 }, legend: { top: 0, left: 0, itemWidth: 16, itemHeight: 2, textStyle: { color: tk.ink2, fontSize: 10 } },
      xAxis: bs.xAxis({ type: "category", data: w.map((x) => monthLabel(x.week)), boundaryGap: false }), yAxis: bs.yAxis({ type: "value" }),
      series: [{ name: "Direct, CRM label", type: "line", showSymbol: false, data: w.map((x) => x.raw_direct), lineStyle: { color: tk["ch-direct"], type: [5, 3], width: 2 }, itemStyle: { color: tk["ch-direct"] } },
        { name: "Direct, corrected", type: "line", showSymbol: false, data: w.map((x) => x.cor_direct), lineStyle: { color: tk["ch-direct"], width: 2 }, itemStyle: { color: tk["ch-direct"] } }] };
  }} />;
}

function Cascade({ c }: { c: Record<string, number> }) {
  const steps = [["Google Ads\n(click date)", c.platform_click_date, true], ["Conversion\nday", c.step_conversion_date], ["CRM vs tag", c.step_not_tracked_or_extra], ["Duplicates", c.step_duplicates], ["Spam &\ninvalid", c.step_spam_invalid], ["UTC day", c.step_time_zone], ["CRM report", c.crm_report, true]] as [string, number, boolean?][];
  let run = 0, lo = Infinity;
  const b: number[] = [], v: number[] = [], col: string[] = [];
  return <Chart height={210} label="Reconciliation cascade" option={(tk) => {
    b.length = 0; v.length = 0; col.length = 0; run = 0; lo = Infinity;
    for (const [, x, tot] of steps) { if (tot) { b.push(0); v.push(x); col.push(tk.ink); run = x; } else { const nr = run + x; b.push(Math.min(run, nr)); v.push(Math.abs(x)); col.push(x >= 0 ? tk.info : tk.signal); run = nr; } lo = Math.min(lo, run); }
    const min = Math.floor((lo * 0.8) / 500) * 500;
    const bs = base(tk);
    return { ...bs, animation: false, grid: { left: 44, right: 6, top: 18, bottom: 34 },
      xAxis: bs.xAxis({ type: "category", data: steps.map((s) => s[0]), axisLabel: { ...bs.font, fontSize: 10, interval: 0 } }), yAxis: bs.yAxis({ type: "value", min }),
      series: [{ type: "bar", stack: "w", data: b.map((x, i) => (steps[i][2] ? min : x)), itemStyle: { color: "transparent" } },
        { type: "bar", stack: "w", barWidth: "55%", data: v.map((x, i) => ({ value: steps[i][2] ? x - min : x, itemStyle: { color: col[i] } })),
          label: { show: true, position: "top", fontSize: 10, color: tk.ink, formatter: (p: { dataIndex: number }) => { const s = steps[p.dataIndex]; return s[2] ? n0(s[1]) : (s[1] > 0 ? "+" : "−") + n0(Math.abs(s[1])); } } }] };
  }} />;
}

function MetaRatio() {
  const { data } = useData();
  const d = data!;
  const o = d.recon.recon.meta["HVAC-PHX"]; const out: [string, number][] = [];
  for (let i = 0; i + 27 < d.meta.dates.length; i += 28) { let p = 0, q = 0; for (let j = i; j < i + 28; j++) { p += o.p[j]; q += o.c[j]; } out.push([d.meta.dates[i], p / q]); }
  return <Chart height={190} label="Meta to CRM ratio for HVAC-PHX" option={(tk) => {
    const bs = base(tk);
    return { ...bs, animation: false, grid: { left: 30, right: 10, top: 10, bottom: 20 },
      xAxis: bs.xAxis({ type: "category", data: out.map((x) => monthLabel(x[0])), boundaryGap: false }), yAxis: bs.yAxis({ type: "value", min: 0, max: 2.2 }),
      series: [{ type: "line", data: out.map((x) => +x[1].toFixed(2)), symbolSize: 5, lineStyle: { width: 2, color: tk["ch-meta"] }, itemStyle: { color: tk["ch-meta"] },
        markArea: { silent: true, itemStyle: { color: tk["verified-wash"] }, data: [[{ yAxis: 0.75 }, { yAxis: 1.3 }]] } }] };
  }} />;
}
void usd;
