"use client";
// 01 Overview: KPIs with trust badges, small multiples per brand, open incidents.
import { useMemo } from "react";
import { useData } from "@/lib/data";
import { filterRows, totals, series, checkScore, selectedBrands, trustOf, COL } from "@/lib/metrics";
import { n0, usd, usdK, pct, brandLabel, dateLabel } from "@/lib/format";
import { KpiTile } from "@/components/Kpi";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, IncNo, BrandChip, DataTag } from "@/components/ui";

export default function Overview() {
  const { data, filters, range } = useData();
  const d = data!;
  const brands = selectedBrands(d, filters);
  const rows = useMemo(() => filterRows(d, filters, range), [d, filters, range]);
  const t = useMemo(() => totals(d, rows), [d, rows]);
  const sc = (ids: string[] | null) => checkScore(d, ids, brands, range);
  const trustAll = sc(null);
  const leadT = sc(["CHK07", "CHK08"]);
  const recT = sc(["CHK03", "CHK05", "CHK06"]);
  const cpl = t.spend / t.paidLeads, cpql = t.spend / t.paidQualified;
  const noise = t.submissions ? (t.submissions - t.qualified) / t.submissions : NaN;

  const incidents = d.incidents.filter((i) => (filters.brand === "ALL" || i.brand === "ALL" || i.brand === filters.brand));

  return (
    <div className="content">
      <PageHead
        eyebrow={`01 · Overview · ${filters.brand === "ALL" ? "five brands" : brandLabel(filters.brand)} · ${dateLabel(d.meta.dates[range[0]])} – ${dateLabel(d.meta.dates[range[1]])}`}
        title={<>{pct(noise, 0)} of what the CRM counts as leads is noise: {n0(t.qualified)} of {n0(t.submissions)} submissions are real, reachable leads</>}
        lede="Every number below is computed in PostgreSQL from six source systems, audited lead by lead, and carries a trust badge. Open “Trace” on any KPI to see the source, the rules and the checks behind it."
      />

      <div className="kpis" role="group" aria-label="Key performance indicators">
        <KpiTile id="leads" value={n0(t.leads)} sub={`${n0(t.submissions)} submissions · ${n0(t.duplicates)} duplicates removed`} trust={trustOf(leadT.passRate)} trustNote={`${pct(leadT.passRate, 0)} of spam/duplicate checks pass`} delay={0} />
        <KpiTile id="qualified" value={n0(t.qualified)} sub={`${n0(t.spam)} spam · ${n0(t.invalid)} invalid excluded`} trust={trustOf(leadT.passRate)} trustNote="Audited: every exclusion has a reason" delay={30} />
        <KpiTile id="spend" value={usdK(t.spend)} sub={`LSA net of ${usd(t.credits)} credits`} trust="reconciled" trustNote="Equals the raw platform exports, LSA credits deducted" delay={60} />
        <KpiTile id="cpl" value={usd(cpl)} sub={`${n0(t.paidLeads)} paid-channel leads`} trust={trustOf(recT.passRate, "reconciled", 0.9)} trustNote={`${pct(recT.passRate, 0)} of platform-vs-CRM checks pass`} delay={90} />
        <KpiTile id="cpql" value={usd(cpql)} sub={`${n0(t.booked)} jobs booked`} trust={trustOf(recT.passRate, "reconciled", 0.9)} trustNote="Reconciled spend / audited leads" delay={120} />
        <KpiTile id="trust" value={Number.isFinite(trustAll.score) ? String(Math.round(trustAll.score)) : "–"} sub={`${n0(trustAll.fail)} failed · ${n0(trustAll.expl)} explained of ${n0(trustAll.n)} runs`} trust={trustAll.score >= 90 ? "verified" : trustAll.score >= 80 ? "reconciled" : "atrisk"} delay={150} />
      </div>

      <div className="grid">
        <Card span={12} id="multiples" tag="sim"
          title="Qualified leads per week, by brand: each brand has its own rhythm, driven by real weather"
          sub="Same scale within each brand, not across brands. Shaded weeks are incidents found by the audit; hover a week for its cost per qualified lead.">
          <div className="multiples">
            {d.meta.brands.filter((b) => filters.brand === "ALL" || b.brand === filters.brand).map((b) => <Multiple key={b.brand} brand={b.brand} />)}
          </div>
        </Card>

        <Card span={7} id="incidents" tag="sim"
          title={`${incidents.length} incidents in the ledger, one of them a false alarm`}
          sub="Found by the automated checks and the audit, each traced to a root cause and quantified. Full log on the Reconciliation and Data quality pages.">
          <ul className="feed">
            {incidents.map((i) => (
              <li key={i.incident_no} id={`inc-${i.incident_no}`}>
                <IncNo n={i.incident_no} />
                <div>
                  <div className="t">{i.title}</div>
                  <div className="e">{i.evidence}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className={`status ${i.kind === "false_signal" ? "explained" : i.status.startsWith("Mitigated") ? "warn" : "pass"}`}>
                    {i.kind === "false_signal" ? "Not a data issue" : i.status}
                  </span>
                  <BrandChip code={i.brand} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card span={5} id="mix" tag="sim" title="Where the noise comes from" sub="Submissions by audit verdict for the selected filters.">
          <VerdictBar t={t} />
          <div className="stats">
            <div className="stat"><div className="v">{pct(t.duplicates / t.submissions)}</div><div className="l">duplicates (form resubmits, call after form, same phone typed differently)</div></div>
            <div className="stat"><div className="v">{pct(t.spam / t.submissions)}</div><div className="l">spam (bots, disposable inboxes, foreign numbers)</div></div>
            <div className="stat"><div className="v">{pct(t.invalid / t.submissions)}</div><div className="l">invalid contact details</div></div>
          </div>
          <WeeklyVerdicts />
          <p className="callout">Cost per lead on raw CRM records would be <strong>{usd(t.spend / Math.max(1, rows.filter((r) => d.meta.channels[r[2]].is_paid).reduce((a, r) => a + r[COL.submissions], 0)))}</strong>; on qualified leads it is <strong>{usd(cpql)}</strong>.</p>
        </Card>
      </div>
    </div>
  );
}

function WeeklyVerdicts() {
  const { data, filters, range } = useData();
  const d = data!;
  const rows = useMemo(() => filterRows(d, filters, range), [d, filters, range]);
  const cols = [["Duplicates", COL.duplicates, "info"], ["Spam", COL.spam, "signal"], ["Invalid", COL.invalid, "attention"]] as const;
  const s = cols.map(([, c]) => series(d, rows, c, "week", range));
  const weeks = s[0].map((x) => x[0]);
  return (
    <Chart height={170} label="Excluded submissions per week, by reason" deps={[rows]}
      table={{ columns: ["Week", ...cols.map((c) => c[0])], rows: weeks.map((w, i) => [w, ...s.map((x) => x[i][1])]) }}
      option={(tk) => {
        const bs = base(tk);
        return {
          ...bs, grid: { left: 34, right: 6, top: 8, bottom: 22 },
          tooltip: { ...bs.tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
          xAxis: bs.xAxis({ type: "category", data: weeks, axisLabel: { ...bs.font, formatter: (v: string) => v.slice(5) } }),
          yAxis: bs.yAxis({ type: "value" }),
          series: cols.map(([name, , c], i) => ({ name, type: "bar", stack: "x", data: s[i].map((x) => x[1]), barCategoryGap: "20%",
            itemStyle: { color: tk[c], borderColor: tk.surface, borderWidth: 0.5 } })),
        };
      }} />
  );
}

function VerdictBar({ t }: { t: ReturnType<typeof totals> }) {
  const parts = [
    { k: "Qualified", v: t.qualified, c: "var(--verified)" },
    { k: "Duplicate", v: t.duplicates, c: "var(--info)" },
    { k: "Spam", v: t.spam, c: "var(--signal)" },
    { k: "Invalid", v: t.invalid, c: "var(--attention)" },
  ];
  const sum = parts.reduce((a, p) => a + p.v, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 14, gap: 2, borderRadius: 4, overflow: "hidden" }} role="img"
        aria-label={parts.map((p) => `${p.k} ${pct(p.v / sum)}`).join(", ")}>
        {parts.map((p) => <div key={p.k} style={{ width: `${(100 * p.v) / sum}%`, background: p.c, minWidth: p.v ? 2 : 0 }} />)}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {parts.map((p) => <span key={p.k}><span className="chdot" style={{ background: p.c }} />{p.k} <b className="mono">{n0(p.v)}</b></span>)}
      </div>
    </div>
  );
}

function Multiple({ brand }: { brand: string }) {
  const { data, filters, range } = useData();
  const d = data!;
  const rows = useMemo(() => filterRows(d, { ...filters, brand }, range), [d, filters, range, brand]);
  const q = series(d, rows, COL.qualified, "week", range);
  const sp = series(d, rows, COL.spend, "week", range);
  const paidIdx = new Set(d.meta.channels.map((c, i) => (c.is_paid ? i : -1)));
  const pq = series(d, rows.filter((r) => paidIdx.has(r[2])), COL.qualified, "week", range);
  const cpql = sp.map(([w, s], i) => [w, pq[i]?.[1] ? s / pq[i][1] : null] as [string, number | null]);
  const t = totals(d, rows);
  const b = d.meta.brands.find((x) => x.brand === brand)!;
  const areas = d.incidents.filter((i) => (i.brand === brand) && i.start_date !== i.end_date && i.start_date > "2025-05-01")
    .map((i) => [{ xAxis: weekOf(i.start_date), name: `#${String(i.incident_no).padStart(2, "0")}` }, { xAxis: weekOf(i.end_date) }]);
  return (
    <div className="multiple">
      <div className="top"><BrandChip code={brand} /><span className="muted" style={{ fontSize: 12 }}>{b.trade}</span></div>
      <div className="top" style={{ marginTop: 8 }}>
        <span className="big">{n0(t.qualified)}</span>
        <span style={{ fontSize: 12, color: "var(--signal-ink)" }}>{usd(t.spend / t.paidQualified)} <span className="muted">CPQL</span></span>
      </div>
      <Chart height={130} label={`${brand} qualified leads per week`} deps={[rows, range[0]]}
        option={(tk) => {
          const bs = base(tk);
          const qmax = Math.max(1, ...q.map((x) => x[1]));
          return {
            ...bs, grid: { left: 2, right: 2, top: 18, bottom: 4 },
            tooltip: { ...bs.tooltip, trigger: "axis", formatter: (p: any[]) => { const c = cpql[p[0].dataIndex]?.[1]; return `Week of ${p[0].axisValue}<br/>Qualified leads <b>${p[0].data}</b><br/>Cost per qualified lead <b>${c != null ? "$" + Math.round(c) : "–"}</b>`; } },
            xAxis: bs.xAxis({ type: "category", data: q.map((x) => x[0]), show: false, boundaryGap: false }),
            yAxis: bs.yAxis({ type: "value", show: false, max: qmax * 1.15 }),
            series: [
              { type: "line", data: q.map((x) => x[1]), showSymbol: false, lineStyle: { width: 2, color: tk.ink }, areaStyle: { color: tk.surface2, opacity: 1 },
                markArea: { silent: true, itemStyle: { color: tk["signal-wash"], opacity: .8 }, label: { color: tk["signal-ink"], fontSize: 10, fontFamily: "JetBrains Mono" }, data: areas } },
            ],
          };
        }} />
    </div>
  );
}

function weekOf(d: string) {
  const dt = new Date(d + "T00:00:00Z"); const dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}
export { weekOf };
void DataTag;
