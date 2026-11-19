"use client";
// 03 Attribution health: coverage of click ids, raw -> corrected channel (Sankey), the redirect incident,
// protected history, and a PUBLIC DATA panel on Google's real GA4 sample.
import { useMemo } from "react";
import { useData } from "@/lib/data";
import { n0, pct, monthLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, Foot } from "@/components/ui";
import { weekOf } from "../page";

const fmtD = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
type H = { brand: string; month: string; leads: number; paid_search_with_utm: number; paid_search_with_gclid: number; paid_landing_without_utm: number; reattributed: number; inferred: number };

export default function Attribution() {
  const { data, filters, range } = useData();
  const d = data!;
  const A = d.attribution;
  const ev = d.audit.evaluation;
  const chLabel = (c: string) => d.meta.channels.find((x) => x.channel === c)?.label ?? (c === "unmapped" ? "Unmapped" : c);
  const fromMonth = d.meta.dates[range[0]].slice(0, 7), toMonth = d.meta.dates[range[1]].slice(0, 7);

  // monthly coverage for the selected brand(s)
  const months = useMemo(() => {
    const m = new Map<string, H>();
    for (const h of A.health as H[]) {
      if ((filters.brand !== "ALL" && h.brand !== filters.brand) || h.month < fromMonth || h.month > toMonth) continue;
      const o = m.get(h.month) ?? { ...h, leads: 0, paid_search_with_utm: 0, paid_search_with_gclid: 0, paid_landing_without_utm: 0, reattributed: 0, inferred: 0 };
      for (const k of ["leads", "paid_search_with_utm", "paid_search_with_gclid", "paid_landing_without_utm", "reattributed", "inferred"] as const) o[k] += Number(h[k]);
      m.set(h.month, o);
    }
    return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [A, filters.brand, fromMonth, toMonth]);

  const sankey = (A.sankey as { brand: string; raw: string; corrected: string; n: number }[]).filter((s) => filters.brand === "ALL" || s.brand === filters.brand);
  const links = new Map<string, number>();
  for (const s of sankey) links.set(`${s.raw}|${s.corrected}`, (links.get(`${s.raw}|${s.corrected}`) ?? 0) + s.n);
  const total = [...links.values()].reduce((a, b) => a + b, 0);
  const moved = [...links.entries()].filter(([k]) => k.split("|")[0] !== k.split("|")[1]).reduce((a, [, v]) => a + v, 0);

  const plmb = (A.weeklyRaw as { brand: string; week: string; raw_direct: number; cor_direct: number; raw_gads: number; cor_gads: number; total: number }[])
    .filter((w) => w.brand === "PLMB-DAL" && w.week >= "2025-11-01" && w.week <= "2026-05-31");
  const hist = A.history as { month: string; channel: string; snapshot: number; naive: number }[];
  const histL = hist.filter((h) => h.channel === "lsa");
  const ga4 = A.ga4;
  const rules = ev.attribution_by_rule as { rule: string; n: number; accuracy: number }[];

  return (
    <div className="content">
      <PageHead eyebrow="03 · Attribution health"
        title={<>Corrected attribution matches the true channel for {pct(ev.attribution.corrected_accuracy)} of leads; the CRM label alone, {pct(ev.attribution.raw_accuracy)}</>}
        lede="Each lead's channel is decided from the strongest evidence available, in a fixed order: integration label, gclid, fbclid, UTM, paid-only landing page, referrer, the staff call log, then the CRM label. Click ids and UTMs are “Verified”; the rest is “Inferred” and labelled as such." />

      <div className="grid">
        <Card span={7} id="coverage" tag="sim" title={<>GCLID coverage fell to {pct(Math.min(...months.filter((m) => m.paid_search_with_utm > 20).map((m) => m.paid_search_with_gclid / m.paid_search_with_utm)), 0)} after a form update<Foot n={4} /></>}
          sub="Share of paid-search leads (with UTM) that also carry a gclid, and share of leads whose channel the rules corrected. Without a gclid, a booked job cannot be sent back to Google Ads as an offline conversion.">
          <Chart height={260} label="Monthly GCLID coverage and share of re-attributed leads" deps={[months]}
            table={{ columns: ["Month", "GCLID coverage", "Re-attributed"], rows: months.map((m) => [m.month, pct(m.paid_search_with_gclid / m.paid_search_with_utm), pct(m.reattributed / m.leads)]) }}
            option={(tk) => {
              const bs = base(tk);
              const x = months.map((m) => monthLabel(m.month));
              return {
                ...bs, grid: { left: 40, right: 120, top: 16, bottom: 26 },
                tooltip: { ...bs.tooltip, trigger: "axis", valueFormatter: (v: number) => pct(v) },
                xAxis: bs.xAxis({ type: "category", data: x, boundaryGap: false }),
                yAxis: bs.yAxis({ type: "value", min: 0, max: 1, axisLabel: { ...bs.font, formatter: (v: number) => `${v * 100}%` } }),
                series: [
                  { name: "GCLID coverage", type: "line", data: months.map((m) => m.paid_search_with_gclid / m.paid_search_with_utm), symbolSize: 6, lineStyle: { width: 2, color: tk["ch-google_ads"] }, itemStyle: { color: tk["ch-google_ads"] },
                    endLabel: { show: true, formatter: "GCLID coverage", color: tk.ink2, fontSize: 11 },
                    markArea: { silent: true, itemStyle: { color: tk["signal-wash"] }, label: { color: tk["signal-ink"], fontFamily: "JetBrains Mono", fontSize: 10 },
                      data: x.includes(monthLabel("2026-06")) ? [[{ xAxis: monthLabel("2026-06"), name: "#04" }, { xAxis: monthLabel("2026-07") }]] : [] } },
                  { name: "Re-attributed", type: "line", data: months.map((m) => m.reattributed / m.leads), symbolSize: 6, lineStyle: { width: 2, color: tk.ink3, type: [5, 3] }, itemStyle: { color: tk.ink3 },
                    endLabel: { show: true, formatter: "Re-attributed", color: tk.ink2, fontSize: 11 } },
                ],
                legend: { show: false },
              };
            }} />
        </Card>

        <Card span={5} id="rules" tag="sim" title="Which rule decided, and how often it was right"
          sub="Accuracy against the simulation's hidden answer key. The CRM-label fallback is the weakest link: it is used only when nothing better exists.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Rule (priority order)</th><th className="num">Leads</th><th className="num">Accuracy</th></tr></thead>
              <tbody>{["integration_label", "gclid", "fbclid", "utm", "paid_landing_page", "referrer", "staff_call_log", "crm_label", "default"].map((r) => {
                const x = rules.find((y) => y.rule === r);
                if (!x) return null;
                return <tr key={r}><td className="mono">{r}</td><td className="num mono">{n0(x.n)}</td><td className="num mono" style={{ color: x.accuracy < 0.95 ? "var(--signal-ink)" : undefined }}>{pct(x.accuracy)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </Card>

        <Card span={12} id="sankey" tag="sim" title={`${pct(moved / total)} of leads changed channel once the evidence was read: ${n0(moved)} of ${n0(total)}`}
          sub="Left: what the CRM attribution label says. Right: the corrected channel. The biggest flows are calls the CRM files as “Direct” that the staff call log attributes, and GBP website clicks the CRM calls “Organic”.">
          <Chart height={380} label="Sankey diagram from CRM channel to corrected channel" deps={[sankey]}
            table={{ columns: ["CRM label channel", "Corrected channel", "Leads"], rows: [...links.entries()].map(([k, v]) => [chLabel(k.split("|")[0]), chLabel(k.split("|")[1]), v]) }}
            option={(tk) => {
              const raws = [...new Set([...links.keys()].map((k) => k.split("|")[0]))];
              const cors = [...new Set([...links.keys()].map((k) => k.split("|")[1]))];
              const color = (c: string) => tk[`ch-${c}`] || tk.ink3;
              return {
                ...base(tk),
                tooltip: { ...base(tk).tooltip, trigger: "item", formatter: (p: any) => p.dataType === "edge" ? `${p.data.source.replace(" ", "")} → ${p.data.target.trim()}<br/><b>${n0(p.data.value)}</b> leads` : `${p.name.trim()}<br/><b>${n0(p.value)}</b>` },
                series: [{
                  type: "sankey", left: 200, right: 160, top: 10, bottom: 10, nodeWidth: 10, nodeGap: 10, draggable: false, layoutIterations: 0,
                  data: [...raws.map((r) => ({ name: `CRM: ${chLabel(r)}`, itemStyle: { color: color(r), borderWidth: 0 }, label: { position: "left", color: tk.ink2 } })),
                    ...cors.map((c) => ({ name: `${chLabel(c)} `, itemStyle: { color: color(c), borderWidth: 0 }, label: { position: "right", color: tk.ink } }))],
                  links: [...links.entries()].map(([k, v]) => ({ source: `CRM: ${chLabel(k.split("|")[0])}`, target: `${chLabel(k.split("|")[1])} `, value: v,
                    lineStyle: { color: k.split("|")[0] === k.split("|")[1] ? tk.rule : color(k.split("|")[1]), opacity: k.split("|")[0] === k.split("|")[1] ? 0.55 : 0.5, curveness: 0.5 } })),
                  label: { fontSize: 12, fontFamily: "Inter, sans-serif" }, emphasis: { focus: "adjacency" },
                }],
              };
            }} />
        </Card>

        <Card span={7} id="redirect" tag="sim" title={<>“Direct is up, Google is down” was wrong: a redirect stripped the UTMs on PLMB·DAL<Foot n={3} /></>}
          sub="Weekly web-form leads. The CRM label (dashed) moves paid search into Direct for six weeks; the corrected channel (solid) stays flat, because the leads still landed on paid-only /lp/ pages.">
          <Chart height={260} label="PLMB-DAL weekly Direct leads, CRM label vs corrected" deps={[]}
            table={{ columns: ["Week", "Direct (CRM label)", "Direct (corrected)", "Google Ads (CRM label)", "Google Ads (corrected)"], rows: plmb.map((w) => [w.week, w.raw_direct, w.cor_direct, w.raw_gads, w.cor_gads]) }}
            option={(tk) => {
              const bs = base(tk);
              const x = plmb.map((w) => w.week);
              const ln = (name: string, key: keyof (typeof plmb)[number], c: string, dashed: boolean) => ({
                name, type: "line", data: plmb.map((w) => w[key]), showSymbol: false, lineStyle: { width: 2, color: c, type: dashed ? [5, 3] : "solid" }, itemStyle: { color: c },
              });
              return {
                ...bs, grid: { left: 34, right: 12, top: 40, bottom: 26 },
                legend: { top: 0, left: 0, itemWidth: 22, itemHeight: 2, textStyle: { color: tk.ink2, fontSize: 11 } },
                tooltip: { ...bs.tooltip, trigger: "axis" },
                xAxis: bs.xAxis({ type: "category", data: x, boundaryGap: false, axisLabel: { ...bs.font, formatter: (v: string) => monthLabel(v) } }),
                yAxis: bs.yAxis({ type: "value" }),
                series: [
                  { ...ln("Direct, CRM label", "raw_direct", tk["ch-direct"], true),
                    markArea: { silent: true, itemStyle: { color: tk["signal-wash"] }, label: { color: tk["signal-ink"], fontFamily: "JetBrains Mono", fontSize: 10 }, data: [[{ xAxis: weekOf("2026-02-09"), name: "#03 redirect" }, { xAxis: weekOf("2026-03-22") }]] } },
                  ln("Direct, corrected", "cor_direct", tk["ch-direct"], false),
                  ln("Google Ads, CRM label", "raw_gads", tk["ch-google_ads"], true),
                  ln("Google Ads, corrected", "cor_gads", tk["ch-google_ads"], false),
                ],
              };
            }} />
        </Card>

        <Card span={5} id="history" tag="sim" title={<>History protected: a mapping edit would have erased LSA from closed months<Foot n={7} /></>}
          sub="LSA leads per month as frozen at month close (bars) vs what the old pipeline would show after the 2026-04-01 channel-map edit (dashed). With SCD2 + snapshots, closed months never move.">
          <Chart height={250} label="LSA leads per month: snapshot vs naive recomputation" deps={[]}
            table={{ columns: ["Month", "Snapshot", "Naive re-run"], rows: histL.map((h) => [h.month, h.snapshot, h.naive]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 40, right: 8, top: 26, bottom: 26 },
                tooltip: { ...bs.tooltip, trigger: "axis" },
                legend: { top: 0, right: 0, textStyle: { color: tk.ink2, fontSize: 11 }, itemWidth: 12, itemHeight: 8, data: ["Snapshot (frozen)", "Naive re-run"] },
                xAxis: bs.xAxis({ type: "category", data: histL.map((h) => monthLabel(h.month)) }),
                yAxis: bs.yAxis({ type: "value" }),
                series: [
                  { name: "Snapshot (frozen)", type: "bar", data: histL.map((h) => h.snapshot), barWidth: "55%", itemStyle: { color: tk["ch-lsa"], borderRadius: [4, 4, 0, 0] } },
                  { name: "Naive re-run", type: "line", data: histL.map((h) => h.naive), symbol: "circle", symbolSize: 7, lineStyle: { color: tk.ink, type: [5, 3], width: 1.5 }, itemStyle: { color: tk.surface, borderColor: tk.ink, borderWidth: 1.5 } },
                ],
              };
            }} />
        </Card>

        <Card span={12} id="ga4" tag="public" title={`In Google's own GA4 sample, only ${pct(ga4.session_source_buckets["Attributed source"], 0)} of sessions have a usable source`}
          sub={<>PUBLIC DATA: Google&apos;s obfuscated GA4 sample (Google Merchandise Store, {fmtD(ga4.period[0])} – {fmtD(ga4.period[1])}, {n0(ga4.sessions)} sessions). E-commerce, not lead-gen: it shows what real tracking data looks like before any cleaning.</>}>
          <div className="grid" style={{ gap: 20 }}>
            <div className="span-7">
              <Chart height={230} label="Share of GA4 sessions by source quality" deps={[]}
                table={{ columns: ["Session source", "Share"], rows: Object.entries(ga4.session_source_buckets).map(([k, v]) => [k, pct(v as number)]) }}
                option={(tk) => {
                  const bs = base(tk);
                  const e = Object.entries(ga4.session_source_buckets as Record<string, number>).sort((a, b) => a[1] - b[1]);
                  return {
                    ...bs, grid: { left: 190, right: 50, top: 4, bottom: 4 },
                    tooltip: { ...bs.tooltip, trigger: "item", valueFormatter: (v: number) => pct(v) },
                    xAxis: bs.xAxis({ type: "value", show: false }),
                    yAxis: bs.yAxis({ type: "category", data: e.map((x) => x[0]), splitLine: { show: false }, axisLabel: { ...bs.font, color: tk.ink2, fontSize: 12 } }),
                    series: [{ type: "bar", barWidth: 12, data: e.map(([k, v]) => ({ value: v, itemStyle: { color: k === "Attributed source" ? tk.verified : tk.info, borderRadius: [0, 4, 4, 0] } })),
                      label: { show: true, position: "right", color: tk.ink2, fontSize: 11, formatter: (p: any) => pct(p.value) } }],
                  };
                }} />
            </div>
            <div className="span-5" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="stats">
                <div className="stat"><div className="v">{pct(ga4.session_source_buckets["Self-referral (own domain)"], 1)}</div><div className="l">of sessions credited to the site&apos;s own domain (self-referral)</div></div>
                <div className="stat"><div className="v">{pct(ga4.first_touch_vs_session_source_mismatch, 0)}</div><div className="l">of sessions come from a different source than the user&apos;s first visit</div></div>
              </div>
              <p className="callout">The same failure modes this project fixes on simulated leads (missing source, self-referral, first touch ≠ last touch) are visible in real Google data. {ga4.note}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
