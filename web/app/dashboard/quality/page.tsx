"use client";
// 06 Data quality monitor: the 11 automated checks, a pass/fail calendar, and the incident log.
import { Fragment, useMemo, useState } from "react";
import { useData } from "@/lib/data";
import { checkScore, selectedBrands } from "@/lib/metrics";
import { n0, pct, brandLabel, dateLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, BrandChip, IncNo } from "@/components/ui";

const ORDER = ["f", "w", "e", "p", "."]; // worst first: fail > warn > explained > pass > n/a
const LABEL: Record<string, string> = { p: "pass", w: "warn", f: "fail", e: "explained", ".": "n/a" };
const VALUE: Record<string, number> = { ".": 0, p: 1, e: 2, w: 3, f: 4 };

export default function Quality() {
  const { data, filters, range } = useData();
  const d = data!;
  const brands = selectedBrands(d, filters);
  const [open, setOpen] = useState<number | null>(null);
  const all = checkScore(d, null, brands, range);

  // worst status per check and day across the selected brands
  const worst = (cid: string, i: number) => {
    const by = d.checks.status[cid] ?? {};
    const codes = Object.entries(by).filter(([b]) => b === "ALL" || brands.includes(b)).map(([, s]) => s[i]);
    return ORDER.find((c) => codes.includes(c)) ?? ".";
  };
  const days = useMemo(() => Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k), [range]);
  const cells = useMemo(() => d.meta.checks.flatMap((c, y) => days.map((i, x) => [x, y, VALUE[worst(c.check_id, i)]])), [d, days, brands.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = d.meta.checks.map((c) => {
    const sc = checkScore(d, [c.check_id], brands, range);
    // last judged day in the period
    let last = "."; let lastDay = range[1];
    for (let i = range[1]; i >= range[0]; i--) { const w = worst(c.check_id, i); if (w !== ".") { last = w; lastDay = i; break; } }
    return { ...c, sc, last, lastDay };
  });
  const incidents = d.incidents.filter((i) => filters.brand === "ALL" || i.brand === "ALL" || i.brand === filters.brand);

  return (
    <div className="content">
      <PageHead eyebrow={`06 · Data quality monitor · ${filters.brand === "ALL" ? "five brands" : brandLabel(filters.brand)}`}
        title={<>{n0(all.n)} automated check runs: {pct(all.passRate, 0)} passed, {n0(all.fail)} failed, and the long red runs are the documented incidents</>}
        lede="Checks run every day per brand on trailing windows (7 to 28 days) so small counts do not raise false alarms. A failure links to a runbook entry; a spike with a real-world cause is marked “explained”, not fixed." />

      <div className="kpis">
        {[["Data Trust Score", Number.isFinite(all.score) ? Math.round(all.score) : "–", "pass + explained = 1, warn = ½"], ["Runs passed", n0(all.pass), pct(all.pass / all.n, 0)],
          ["Warnings", n0(all.warn), "mostly the call-sheet labels"], ["Failures", n0(all.fail), "long runs = incidents; short = noise"], ["Explained", n0(all.expl), "real demand, not a bug"], ["Incidents", String(incidents.length), "1 false alarm"]]
          .map(([l, v, s]) => (
            <div key={String(l)} className="kpi" style={{ borderTopColor: l === "Failures" ? "var(--signal)" : l === "Warnings" ? "var(--attention)" : l === "Explained" ? "var(--info)" : l === "Runs passed" ? "var(--verified)" : undefined }}>
              <div className="label"><span>{l}</span></div><div className="value">{v}</div><div className="sub">{s}</div>
            </div>
          ))}
      </div>

      <div className="grid">
        <Card span={12} id="calendar" tag="sim" title="Check calendar: one row per check, one cell per day"
          sub="Worst result across the selected brands. Red runs line up with incidents: Meta (CHK03) until July 2026, GA4 on ROOF·TPA (CHK04), the PLMB·DAL redirect (CHK02, CHK05), the June form update (CHK01). CHK09 stays amber: the call-sheet labels are a chronic, open issue.">
          <Chart height={330} label="Calendar heatmap of daily check results" deps={[cells]}
            table={{ columns: ["Check", "Pass", "Warn", "Fail", "Explained"], rows: rows.map((r) => [`${r.check_id} ${r.name}`, r.sc.pass, r.sc.warn, r.sc.fail, r.sc.expl]) }}
            option={(tk) => {
              const bs = base(tk);
              const col = [tk.surface2, tk.verified, tk.info, tk.attention, tk.signal];
              return {
                ...bs, grid: { left: 200, right: 12, top: 6, bottom: 52 },
                tooltip: { ...bs.tooltip, trigger: "item", formatter: (p: any) => `${d.meta.checks[p.data[1]].check_id} ${d.meta.checks[p.data[1]].name}<br/>${dateLabel(d.meta.dates[days[p.data[0]]])}: <b>${LABEL[ORDER.find((c) => VALUE[c] === p.data[2])!]}</b>` },
                xAxis: bs.xAxis({ type: "category", data: days.map((i) => d.meta.dates[i]), axisLabel: { ...bs.font, interval: (i: number) => d.meta.dates[days[i]].endsWith("-01"), formatter: (v: string) => new Date(v + "T00:00:00Z").toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) } }),
                yAxis: bs.yAxis({ type: "category", inverse: true, data: d.meta.checks.map((c) => `${c.check_id}  ${c.name}`), splitLine: { show: false }, axisLabel: { ...bs.font, color: tk.ink2, fontSize: 11.5 } }),
                visualMap: { type: "piecewise", show: true, orient: "horizontal", left: 200, bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: tk.ink2, fontSize: 11 },
                  pieces: [{ value: 1, label: "Pass", color: col[1] }, { value: 2, label: "Explained", color: col[2] }, { value: 3, label: "Warn", color: col[3] }, { value: 4, label: "Fail", color: col[4] }, { value: 0, label: "Not judged", color: col[0] }] },
                series: [{ type: "heatmap", data: cells, progressive: 0, itemStyle: { borderColor: tk.surface, borderWidth: days.length > 200 ? 0.3 : 1 } }],
              };
            }} />
        </Card>

        <Card span={12} id="checks" tag="sim" title="Checks: rule, threshold, last result and what to do when it fails">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Check</th><th>Rule</th><th>Threshold</th><th className="num">Window</th><th>Last result</th><th className="num">Pass rate</th><th>Runbook</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.check_id}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{r.check_id}</b> {r.name}</td>
                  <td className="ink2">{r.rule}</td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{r.threshold}</td>
                  <td className="num">{r.window_days ? `${r.window_days} d` : "monthly"}</td>
                  <td style={{ whiteSpace: "nowrap" }}><span className={`status ${LABEL[r.last]}`}>{LABEL[r.last]}</span> <span className="muted" style={{ fontSize: 11.5 }}>{d.meta.dates[r.lastDay]}</span></td>
                  <td className="num">{pct(r.sc.passRate, 0)}</td>
                  <td className="ink2" style={{ fontSize: 12 }}>{r.runbook}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>

        <Card span={12} id="log" tag="sim" title="Incident log: symptom, root cause, evidence, impact, fix"
          sub="Every number in this log is computed in SQL (db/transforms/80_incident_log.sql). Click a row for the full entry.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>#</th><th>Incident</th><th>Brand</th><th>Period</th><th>Evidence</th><th>Status</th></tr></thead>
              <tbody>{incidents.map((i) => (
                <Fragment key={i.incident_no}>
                  <tr id={`inc-${i.incident_no}`} onClick={() => setOpen(open === i.incident_no ? null : i.incident_no)} style={{ cursor: "pointer" }} aria-expanded={open === i.incident_no}>
                    <td><IncNo n={i.incident_no} /></td>
                    <td><b>{i.title}</b></td>
                    <td><BrandChip code={i.brand} /></td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{i.start_date === i.end_date ? i.start_date : `${i.start_date} → ${i.end_date}`}</td>
                    <td className="ink2">{i.evidence}</td>
                    <td><span className={`status ${i.kind === "false_signal" ? "explained" : i.status.startsWith("Mitigated") ? "warn" : "pass"}`}>{i.kind === "false_signal" ? "Not a data issue" : i.status}</span></td>
                  </tr>
                  {open === i.incident_no && (
                    <tr key={`${i.incident_no}-d`}><td />
                      <td colSpan={5} style={{ background: "var(--surface-2)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 12.5 }}>
                          <div><div className="eyebrow">Symptom</div>{i.symptom}</div>
                          <div><div className="eyebrow">Root cause</div>{i.root_cause}</div>
                          <div><div className="eyebrow">Impact</div>{i.impact}</div>
                          <div><div className="eyebrow">Fix</div>{i.fix}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
