"use client";
// 05 Reconciliation: platform vs CRM, explained step by step.
import { useMemo, useState } from "react";
import { useData } from "@/lib/data";
import { selectedBrands } from "@/lib/metrics";
import { n0, pct, usd, monthLabel, brandLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, Foot } from "@/components/ui";

type Casc = { brand: string; month: string; platform_click_date: number; step_conversion_date: number; step_not_tracked_or_extra: number; step_duplicates: number; step_spam_invalid: number; step_time_zone: number; crm_report: number };
const SYSTEMS: [string, string][] = [["google_ads", "Google Ads"], ["meta", "Meta Ads"], ["lsa", "Local Services Ads"], ["ga4", "GA4"], ["call_sheet", "Call sheet"]];

export default function Reconciliation() {
  const { data, filters, range } = useData();
  const d = data!;
  const brands = selectedBrands(d, filters);
  const [basis, setBasis] = useState<"local" | "utc">("local");
  const fromM = d.meta.dates[range[0]].slice(0, 7), toM = d.meta.dates[range[1]].slice(0, 7);

  const c = useMemo(() => {
    const keys = ["platform_click_date", "step_conversion_date", "step_not_tracked_or_extra", "step_duplicates", "step_spam_invalid", "step_time_zone", "crm_report"] as const;
    const o = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
    for (const r of d.recon.cascade as Casc[]) if (brands.includes(r.brand) && r.month >= fromM && r.month <= toM) for (const k of keys) o[k] += Number(r[k]);
    return o;
  }, [d, brands, fromM, toM]);

  const steps = [
    { name: "Google Ads reports\n(click date)", v: c.platform_click_date, total: true },
    { name: "Re-dated to the\nconversion day", v: c.step_conversion_date },
    { name: "CRM vs tag\n(blocked / extra)", v: c.step_not_tracked_or_extra },
    { name: "Duplicates\nremoved", v: c.step_duplicates },
    { name: "Spam & invalid\nremoved", v: c.step_spam_invalid },
    { name: "Local day →\nUTC day", v: c.step_time_zone },
    { name: "CRM report\n(qualified, UTC)", v: c.crm_report, total: true },
  ];

  // weekly gap heatmap per system
  const heat = useMemo(() => {
    const weeks: string[] = []; const wi: number[] = [];
    for (let i = range[0]; i <= range[1]; i++) {
      const dt = new Date(d.meta.dates[i] + "T00:00:00Z"); const dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow);
      const w = dt.toISOString().slice(0, 10);
      if (weeks[weeks.length - 1] !== w) weeks.push(w);
      wi[i] = weeks.length - 1;
    }
    const cells: [number, number, number | null][] = [];
    SYSTEMS.forEach(([sys], si) => {
      const p = Array(weeks.length).fill(0), q = Array(weeks.length).fill(0);
      for (const b of brands) {
        const o = d.recon.recon[sys]?.[b];
        if (!o) continue;
        for (let i = range[0]; i <= range[1]; i++) { p[wi[i]] += o.p[i]; q[wi[i]] += basis === "local" ? o.c[i] : o.u[i]; }
      }
      weeks.forEach((_, k) => cells.push([k, si, q[k] >= 5 ? (p[k] - q[k]) / q[k] : null]));
    });
    return { weeks, cells };
  }, [d, brands, range, basis]);

  // daily Google Ads vs CRM (local and UTC), last 21 days of the period
  const lastDays = useMemo(() => {
    const from = Math.max(range[0], range[1] - 20);
    const out: { date: string; p: number; c: number; u: number }[] = [];
    for (let i = from; i <= range[1]; i++) {
      let p = 0, cc = 0, u = 0;
      for (const b of brands) { const o = d.recon.recon.google_ads[b]; p += o.p[i]; cc += o.c[i]; u += o.u[i]; }
      out.push({ date: d.meta.dates[i], p, c: cc, u });
    }
    return out;
  }, [d, brands, range]);
  const mad = (k: "c" | "u") => lastDays.reduce((a, x) => a + Math.abs(x.p - x[k]), 0) / lastDays.length;

  // Meta / CRM weekly ratio for HVAC-PHX (incidents 5 and 12)
  const meta = useMemo(() => {
    const o = d.recon.recon.meta["HVAC-PHX"]; const out: { w: string; r: number }[] = [];
    for (let i = 0; i + 13 < d.meta.dates.length; i += 14) {
      let p = 0, q = 0; for (let j = i; j < i + 14; j++) { p += o.p[j]; q += o.c[j]; }
      out.push({ w: d.meta.dates[i], r: q ? p / q : NaN });
    }
    return out;
  }, [d]);
  const inc = (n: number) => d.incidents.find((i) => i.incident_no === n)!;

  return (
    <div className="content">
      <PageHead eyebrow={`05 · Reconciliation · ${filters.brand === "ALL" ? "five brands" : brandLabel(filters.brand)} · ${monthLabel(fromM)} – ${monthLabel(toM)}`}
        title={<>Google Ads reported {n0(c.platform_click_date)} conversions, the CRM report {n0(c.crm_report)}: every lead of the gap is accounted for</>}
        lede="The two numbers are both “right”: they count different things on different days in different time zones. The cascade below converts one into the other, one documented step at a time, so the gap stops being an argument." />

      <div className="grid">
        <Card span={12} id="cascade" tag="sim" title="Reconciliation cascade: platform → CRM, step by step"
          sub="In this simulation Google Ads counts a conversion on the day of the ad click (modelled; see PLATFORM_NOTES), in the account's time zone, every time the tag fires. The CRM report counts unique, qualified leads on UTC days. Each bar is one of those differences, measured.">
          <Chart height={330} label="Waterfall from Google Ads conversions to CRM qualified leads" deps={[c]}
            table={{ columns: ["Step", "Leads"], rows: steps.map((s) => [s.name.replace("\n", " "), s.v]) }}
            option={(tk) => {
              const bs = base(tk);
              let run = 0;
              let lo = Infinity, r2 = 0;
              for (const s of steps) { r2 = s.total ? s.v : r2 + s.v; lo = Math.min(lo, r2); }
              const axisMin = Math.max(0, Math.floor((lo * 0.8) / 500) * 500);
              const baseVals: number[] = [], up: (number | string)[] = [], down: (number | string)[] = [], tot: (number | string)[] = [];
              for (const s of steps) {
                if (s.total) { tot.push(s.v); baseVals.push(0); up.push("-"); down.push("-"); run = s.v; continue; }
                tot.push("-");
                if (s.v >= 0) { baseVals.push(run); up.push(s.v); down.push("-"); run += s.v; } else { run += s.v; baseVals.push(run); down.push(-s.v); up.push("-"); }
              }
              const totalsBars = tot.map((v) => (v === "-" ? "-" : (v as number) - axisMin));
              const lab = (sign: string) => ({ show: true, position: "top", color: tk.ink, fontSize: 12, fontFamily: "JetBrains Mono", formatter: (p: any) => (p.value === "-" || p.value === 0 ? "" : `${sign}${n0(p.value)}`) });
              return {
                ...bs, grid: { left: 44, right: 12, top: 24, bottom: 44 },
                tooltip: { ...bs.tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: any[]) => { const s = steps[p[0].dataIndex]; return `${s.name.replace("\n", " ")}<br/><b>${s.v > 0 && !s.total ? "+" : ""}${n0(s.v)}</b>`; } },
                xAxis: bs.xAxis({ type: "category", data: steps.map((s) => s.name), axisLabel: { ...bs.font, color: tk.ink2, fontSize: 11, interval: 0, lineHeight: 14 } }),
                // The axis starts near the smallest running total so the steps are readable (stated under the chart).
                yAxis: bs.yAxis({ type: "value", min: axisMin }),
                series: [
                  { type: "bar", stack: "w", data: baseVals.map((v, i) => (steps[i].total ? axisMin : v)), itemStyle: { color: "transparent" }, emphasis: { disabled: true }, barWidth: "52%" },
                  { type: "bar", stack: "w", data: totalsBars, itemStyle: { color: tk.ink, borderRadius: [4, 4, 0, 0] }, label: { ...lab(""), formatter: (p: any) => (p.value === "-" ? "" : n0(p.value + axisMin)) } },
                  { type: "bar", stack: "w", data: up, itemStyle: { color: tk.info, borderRadius: [4, 4, 0, 0] }, label: lab("+") },
                  { type: "bar", stack: "w", data: down, itemStyle: { color: tk.signal, borderRadius: [4, 4, 0, 0] }, label: lab("−") },
                ],
              };
            }} />
          <div className="legend"><span><span className="chdot" style={{ background: "var(--ink)" }} />Totals</span><span><span className="chdot" style={{ background: "var(--info)" }} />Adds leads</span><span><span className="chdot" style={{ background: "var(--signal)" }} />Removes leads</span><span className="muted">Axis starts above zero so the steps are readable.</span></div>
        </Card>

        <Card span={12} id="heat" tag="sim" title="Weekly gap between each platform and the CRM: the incidents are the only dark cells"
          sub="(platform − CRM) / CRM per week. Orange = the platform counts more, blue = fewer, near-white = in agreement. Switch to UTC days to see the false gaps a naive daily comparison creates."
          right={<div className="seg" role="group" aria-label="CRM day basis">
            <button aria-pressed={basis === "local"} onClick={() => setBasis("local")}>Local day</button>
            <button aria-pressed={basis === "utc"} onClick={() => setBasis("utc")}>UTC day</button>
          </div>}>
          <Chart height={250} label="Heatmap of weekly platform versus CRM gaps by system" deps={[heat]}
            table={{ columns: ["Week", ...SYSTEMS.map((s) => s[1])], rows: heat.weeks.map((w, k) => [w, ...SYSTEMS.map((_, si) => { const v = heat.cells.find((x) => x[0] === k && x[1] === si)?.[2]; return v == null ? "–" : pct(v, 0); })]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 120, right: 16, top: 8, bottom: 56 },
                tooltip: { ...bs.tooltip, trigger: "item", formatter: (p: any) => `${SYSTEMS[p.data[1]][1]} · week of ${heat.weeks[p.data[0]]}<br/>Gap <b>${p.data[2] == null ? "n/a (few leads)" : pct(p.data[2], 0)}</b>` },
                xAxis: bs.xAxis({ type: "category", data: heat.weeks, splitArea: { show: false }, axisLabel: { ...bs.font, formatter: (v: string) => monthLabel(v) } }),
                yAxis: bs.yAxis({ type: "category", data: SYSTEMS.map((s) => s[1]), splitLine: { show: false }, axisLabel: { ...bs.font, color: tk.ink2, fontSize: 12 } }),
                visualMap: { type: "continuous", min: -0.5, max: 0.5, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 160, itemWidth: 10,
                  text: ["platform higher", "platform lower"], textStyle: { color: tk.ink3, fontSize: 11 },
                  inRange: { color: [tk.info, tk["info-wash"], tk.surface2, tk["signal-wash"], tk.signal] }, outOfRange: { color: tk.surface2 } },
                series: [{ type: "heatmap", data: heat.cells.map(([x, y, v]) => [x, y, v == null ? "-" : Math.max(-0.5, Math.min(0.5, v))]), itemStyle: { borderColor: tk.surface, borderWidth: 1.5, borderRadius: 2 } }],
              };
            }} />
        </Card>

        <Card span={6} id="tz" tag="sim" title={<>Time zones alone create daily gaps that are not errors<Foot n={6} /></>}
          sub={`Last 21 days of the period: Google Ads conversions (account time) vs CRM Google Ads forms counted on the brand's local day and on the UTC day. Mean absolute daily gap: ${mad("c").toFixed(1)} on local days, ${mad("u").toFixed(1)} on UTC days.`}>
          <Chart height={230} label="Daily Google Ads conversions versus CRM, local and UTC days" deps={[lastDays]}
            table={{ columns: ["Date", "Google Ads", "CRM local day", "CRM UTC day"], rows: lastDays.map((x) => [x.date, x.p, x.c, x.u]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 30, right: 110, top: 12, bottom: 24 },
                tooltip: { ...bs.tooltip, trigger: "axis" },
                xAxis: bs.xAxis({ type: "category", data: lastDays.map((x) => x.date.slice(5)) }),
                yAxis: bs.yAxis({ type: "value" }),
                series: [
                  { name: "Google Ads", type: "bar", data: lastDays.map((x) => x.p), barWidth: "50%", itemStyle: { color: tk["ch-google_ads"], opacity: .35, borderRadius: [3, 3, 0, 0] } },
                  { name: "CRM, local day", type: "line", data: lastDays.map((x) => x.c), symbolSize: 6, lineStyle: { width: 2, color: tk.ink }, itemStyle: { color: tk.ink }, endLabel: { show: true, formatter: "CRM local", color: tk.ink2, fontSize: 11 } },
                  { name: "CRM, UTC day", type: "line", data: lastDays.map((x) => x.u), symbolSize: 6, lineStyle: { width: 1.5, color: tk.signal, type: [4, 3] }, itemStyle: { color: tk.signal }, endLabel: { show: true, formatter: "CRM UTC", color: tk.ink2, fontSize: 11 } },
                ],
              };
            }} />
          <p className="callout">A lead at <strong>6:30 pm in Phoenix</strong> (UTC−7) is stored as <strong>01:30 UTC the next day</strong>. Compared on UTC days, the CRM looks late every evening and month-ends drift. Rule: every KPI uses the brand&apos;s local day; UTC is kept for audit. {inc(6).evidence}.</p>
        </Card>

        <Card span={6} id="meta" tag="sim" title={<>Meta over-reported leads by {pct(Number((inc(5).evidence.match(/= ([\d.]+)/) || [])[1]) - 1, 0)} until Pixel and CAPI shared an event_id<Foot n={5} /><Foot n={12} /></>}
          sub="HVAC·PHX, Meta-reported leads / CRM Meta leads, per two-week block. The band is the CHK03 tolerance (0.75–1.30).">
          <Chart height={230} label="Meta to CRM lead ratio for HVAC-PHX over time" deps={[meta]}
            table={{ columns: ["Two weeks from", "Meta / CRM"], rows: meta.map((m) => [m.w, Number.isFinite(m.r) ? m.r.toFixed(2) : "–"]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 36, right: 16, top: 16, bottom: 24 },
                tooltip: { ...bs.tooltip, trigger: "axis", valueFormatter: (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "–") },
                xAxis: bs.xAxis({ type: "category", data: meta.map((m) => m.w), boundaryGap: false, axisLabel: { ...bs.font, formatter: (v: string) => monthLabel(v) } }),
                yAxis: bs.yAxis({ type: "value", min: 0, max: 2.5 }),
                series: [{
                  type: "line", data: meta.map((m) => (Number.isFinite(m.r) ? +m.r.toFixed(3) : null)), symbolSize: 6, lineStyle: { width: 2, color: tk["ch-meta"] }, itemStyle: { color: tk["ch-meta"] },
                  markArea: { silent: true, itemStyle: { color: tk["verified-wash"], opacity: .7 }, data: [[{ yAxis: 0.75 }, { yAxis: 1.3 }]] },
                  markLine: { silent: true, symbol: "none", lineStyle: { color: tk.ink3, type: [4, 3] }, label: { color: tk.ink2, fontSize: 11, formatter: "event_id shared" }, data: [{ xAxis: meta.findIndex((m) => m.w >= "2026-07-01") }] },
                }],
              };
            }} />
        </Card>

        {[8, 10, 9].map((n) => {
          const i = inc(n);
          return (
            <Card key={n} span={4} id={`inc-${n}`} tag="sim" title={<>{i.title}<Foot n={n} /></>}>
              <p className="ink2" style={{ fontSize: 13.5 }}><b>Cause.</b> {i.root_cause}.</p>
              <p className="callout"><strong>{i.evidence}.</strong> {i.impact}.</p>
              <p className="muted" style={{ fontSize: 13 }}><b>Fix.</b> {i.fix}.</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
void usd;
