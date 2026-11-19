"use client";
// 02 Channels & spend: cost per lead by channel and brand, spend pacing, LSA net of credits, leads per 10k residents.
import { useMemo } from "react";
import { useData } from "@/lib/data";
import { filterRows, totals, series, COL } from "@/lib/metrics";
import { n0, n1, usd, usdK, pct, brandLabel, monthLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, Foot, ChannelDot } from "@/components/ui";

export default function Channels() {
  const { data, filters, range } = useData();
  const d = data!;
  const ch = d.meta.channels;
  const rowsAll = useMemo(() => filterRows(d, filters, range, { ignoreChannel: true }), [d, filters, range]);

  // per channel totals
  const byCh = ch.map((c, i) => ({ ...c, t: totals(d, rowsAll.filter((r) => r[COL.channel] === i)) }));
  const paid = byCh.filter((c) => c.is_paid);
  const best = [...paid].sort((a, b) => a.t.spend / a.t.qualified - b.t.spend / b.t.qualified)[0];
  const worst = [...paid].sort((a, b) => b.t.spend / b.t.qualified - a.t.spend / a.t.qualified)[0];

  // brand x paid channel CPQL matrix
  const brands = d.meta.brands.filter((b) => filters.brand === "ALL" || b.brand === filters.brand);
  const matrix = brands.map((b) => {
    const bi = d.meta.brands.findIndex((x) => x.brand === b.brand);
    return { brand: b.brand, cells: paid.map((c) => { const ci = ch.findIndex((x) => x.channel === c.channel); return totals(d, rowsAll.filter((r) => r[COL.brand] === bi && r[COL.channel] === ci)); }) };
  });

  // monthly spend by paid channel (stacked)
  const months = series(d, rowsAll, COL.spend, "month", range).map((x) => x[0]);
  const spendBy = paid.map((c) => { const ci = ch.findIndex((x) => x.channel === c.channel); return series(d, rowsAll.filter((r) => r[COL.channel] === ci), COL.spend, "month", range); });

  // LSA gross vs net (monthly)
  const lsaIdx = ch.findIndex((x) => x.channel === "lsa");
  const lsaRows = rowsAll.filter((r) => r[COL.channel] === lsaIdx);
  const lsaG = series(d, lsaRows, COL.spendGross, "month", range), lsaC = series(d, lsaRows, COL.credits, "month", range);
  const lsaT = totals(d, lsaRows);

  // leads per 10k residents (Census, PUBLIC DATA) per brand, per year of the period
  const years = (range[1] - range[0] + 1) / 365.25;
  const perCap = d.meta.brands.map((b, bi) => {
    const t = totals(d, filterRows(d, { ...filters, brand: b.brand }, range, { ignoreChannel: true }));
    return { brand: b.brand, county: b.county, pop: b.population_2025, v: (t.qualified / years / b.population_2025) * 1e4 };
  });

  return (
    <div className="content">
      <PageHead eyebrow={`02 · Channels & spend · ${filters.brand === "ALL" ? "five brands" : brandLabel(filters.brand)}`}
        title={<>{best.label} brings the cheapest qualified leads ({usd(best.t.spend / best.t.qualified)}); {worst.label} the most expensive ({usd(worst.t.spend / worst.t.qualified)})</>}
        lede="Spend is net of approved LSA dispute credits. Cost per lead uses the corrected channel, after duplicates and spam are removed. The channel filter does not apply on this page: it compares channels." />

      <div className="kpis seven" role="group" aria-label="Cost per channel">
        {byCh.map((c) => (
          <div key={c.channel} className="kpi" style={{ borderTopColor: `var(--ch-${c.channel})` }}>
            <div className="label"><span>{c.label}</span></div>
            <div className="value">{c.is_paid ? usd(c.t.spend / c.t.qualified) : n0(c.t.qualified)}</div>
            <div className="sub">{c.is_paid ? `per qualified lead · ${n0(c.t.qualified)} leads · ${usdK(c.t.spend)}` : "qualified leads · no media cost"}</div>
          </div>
        ))}
      </div>

      <div className="grid">
        <Card span={7} id="matrix" tag="sim" title="Cost per qualified lead, by brand and paid channel"
          sub="Darker = more expensive within the table. Roofing pays the most on Google Ads and LSA (higher job value, more competition); Meta is costliest for electrical and plumbing.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Brand</th>{paid.map((c) => <th key={c.channel} className="num"><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ChannelDot ch={c.channel} />{c.label}</span></th>)}<th className="num">All paid</th></tr></thead>
              <tbody>
                {(() => {
                  const vals = matrix.flatMap((m) => m.cells.map((t) => t.spend / t.qualified)).filter(Number.isFinite);
                  const lo = Math.min(...vals), hi = Math.max(...vals);
                  return matrix.map((m) => {
                    const all = m.cells.reduce((a, t) => ({ s: a.s + t.spend, q: a.q + t.qualified }), { s: 0, q: 0 });
                    return (
                      <tr key={m.brand}>
                        <td><span className="chip">{brandLabel(m.brand)}</span></td>
                        {m.cells.map((t, i) => {
                          const v = t.spend / t.qualified; const k = (v - lo) / (hi - lo || 1);
                          return <td key={i} className="num" style={{ background: `color-mix(in srgb, var(--info) ${Math.round(8 + k * 40)}%, var(--surface))`, color: k > 0.6 ? "var(--surface)" : undefined, fontWeight: 600 }}>{usd(v)}</td>;
                        })}
                        <td className="num" style={{ fontWeight: 700 }}>{usd(all.s / all.q)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>

        <Card span={5} id="percap" tag="public" title="Qualified leads per 10,000 residents per year"
          sub="Market penetration: simulated qualified leads over the county population (US Census 2025 estimates, PUBLIC DATA).">
          <Chart height={210} label="Qualified leads per 10,000 residents by brand" deps={[perCap]}
            table={{ columns: ["Brand", "County", "Population", "Leads / 10k / yr"], rows: perCap.map((p) => [p.brand, p.county, n0(p.pop), n1(p.v)]) }}
            option={(tk) => {
              const bs = base(tk);
              const r = [...perCap].sort((a, b) => a.v - b.v);
              return {
                ...bs, grid: { left: 70, right: 40, top: 4, bottom: 4 },
                tooltip: { ...bs.tooltip, trigger: "item", formatter: (p: any) => `${r[p.dataIndex].county}<br/>${n0(r[p.dataIndex].pop)} residents<br/><b>${n1(p.value)}</b> leads / 10k / year` },
                xAxis: bs.xAxis({ type: "value", show: false }),
                yAxis: bs.yAxis({ type: "category", data: r.map((x) => brandLabel(x.brand)), splitLine: { show: false }, axisLabel: { ...bs.font, color: tk.ink2, fontSize: 12 } }),
                series: [{ type: "bar", barWidth: 12, data: r.map((x) => ({ value: +x.v.toFixed(2), itemStyle: { color: filters.brand === "ALL" || x.brand === filters.brand ? tk.info : tk.rule, borderRadius: [0, 3, 3, 0] } })),
                  label: { show: true, position: "right", color: tk.ink2, fontSize: 11, formatter: (p: any) => n1(p.value) } }],
              };
            }} />
        </Card>

        <Card span={8} id="pacing" tag="sim" title="Monthly spend by paid channel" sub="Net spend. Google Ads budgets follow the season; Meta and LSA are steadier.">
          <Chart height={260} label="Monthly spend by paid channel, stacked" deps={[spendBy]}
            table={{ columns: ["Month", ...paid.map((c) => c.label)], rows: months.map((m, i) => [m, ...spendBy.map((s) => Math.round(s[i]?.[1] ?? 0))]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 52, right: 10, top: 30, bottom: 24 },
                legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: tk.ink2, fontSize: 11 } },
                tooltip: { ...bs.tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => usd(v) },
                xAxis: bs.xAxis({ type: "category", data: months.map(monthLabel) }),
                yAxis: bs.yAxis({ type: "value", axisLabel: { ...bs.font, formatter: (v: number) => usdK(v) } }),
                series: paid.map((c, i) => ({ name: c.label, type: "bar", stack: "s", barWidth: "60%", data: spendBy[i].map((x) => Math.round(x[1])),
                  itemStyle: { color: tk[`ch-${c.channel}`], borderColor: tk.surface, borderWidth: 1 } })),
              };
            }} />
        </Card>

        <Card span={4} id="lsa" tag="sim" title={<>LSA: {usd(lsaT.credits)} of credits ignored by the gross report<Foot n={8} /></>}
          sub={`Gross charges vs net of approved disputes. Cost per LSA lead: ${usd(lsaT.spendGross / lsaT.leads)} gross, ${usd(lsaT.spend / lsaT.leads)} net (${pct(lsaT.credits / lsaT.spendGross)} credited). Credits are modelled (see PLATFORM_NOTES).`}>
          <Chart height={210} label="LSA monthly gross charges and credits" deps={[lsaG]}
            table={{ columns: ["Month", "Gross $", "Credits $"], rows: lsaG.map((g, i) => [g[0], Math.round(g[1]), Math.round(lsaC[i][1])]) }}
            option={(tk) => {
              const bs = base(tk);
              return {
                ...bs, grid: { left: 48, right: 8, top: 28, bottom: 24 },
                legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: tk.ink2, fontSize: 11 } },
                tooltip: { ...bs.tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => usd(v) },
                xAxis: bs.xAxis({ type: "category", data: lsaG.map((x) => monthLabel(x[0])) }),
                yAxis: bs.yAxis({ type: "value", axisLabel: { ...bs.font, formatter: (v: number) => usdK(v) } }),
                series: [
                  { name: "Net cost", type: "bar", stack: "l", data: lsaG.map((g, i) => Math.round(g[1] - lsaC[i][1])), itemStyle: { color: tk["ch-lsa"] } },
                  { name: "Credited back", type: "bar", stack: "l", data: lsaC.map((x) => Math.round(x[1])), itemStyle: { color: tk["signal-wash"], borderColor: tk["ch-lsa"], borderWidth: 1, borderType: "dashed" } },
                ],
              };
            }} />
        </Card>
      </div>
    </div>
  );
}
