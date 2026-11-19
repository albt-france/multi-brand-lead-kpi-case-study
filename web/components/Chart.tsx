"use client";
// ECharts wrapper. The chart theme is read from the same CSS variables as the page,
// so light/dark and the channel colors are identical everywhere.
// Accessibility: role="img" + aria-label, and a "View as table" toggle with the same numbers.
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, SankeyChart, HeatmapChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, CalendarComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, BarChart, SankeyChart, HeatmapChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, CalendarComponent, SVGRenderer]);

export type Tokens = Record<string, string> & { ink: string; ink2: string; ink3: string; rule: string; grid: string; surface: string; bg: string };

/** Reads the current theme tokens from :root. */
export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const names = ["ink", "ink-2", "ink-3", "rule", "rule-soft", "grid", "surface", "surface-2", "bg", "signal", "signal-ink", "verified", "verified-ink", "info", "info-ink", "attention", "attention-ink",
    "signal-wash", "verified-wash", "info-wash", "attention-wash",
    "ch-google_ads", "ch-lsa", "ch-meta", "ch-gbp", "ch-seo", "ch-direct", "ch-referral"];
  const t: Record<string, string> = {};
  for (const n of names) t[n.replace("-2", "2").replace("-3", "3")] = v(`--${n}`);
  return t as Tokens;
}

/** Watches theme changes (toggle or OS) and returns a counter that changes with it. */
export function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);
  return v;
}

/** Base pieces shared by every chart: quiet axes, horizontal grid only, sober tooltip. */
export function base(t: Tokens) {
  const font = { fontFamily: "Inter, system-ui, sans-serif", color: t.ink3, fontSize: 11 };
  return {
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: t.ink2 },
    animationDuration: 220, animationDurationUpdate: 180, animationEasing: "cubicOut",
    tooltip: {
      backgroundColor: t.surface, borderColor: t.rule, borderWidth: 1, padding: [8, 10],
      textStyle: { color: t.ink, fontSize: 12, fontFamily: "Inter, system-ui, sans-serif" },
      extraCssText: "box-shadow: 0 8px 24px -12px rgba(0,0,0,.35); border-radius: 8px;",
    },
    xAxis: (o: object = {}) => ({ axisLine: { lineStyle: { color: t.rule } }, axisTick: { show: false }, axisLabel: { ...font, hideOverlap: true }, splitLine: { show: false }, ...o }),
    yAxis: (o: object = {}) => ({ axisLine: { show: false }, axisTick: { show: false }, axisLabel: font, splitLine: { lineStyle: { color: t.grid } }, ...o }),
    font,
  };
}

type Props = {
  option: (t: Tokens) => object;
  height?: number;
  label: string;                 // aria-label: what the chart shows
  table?: { columns: string[]; rows: (string | number)[][] };
  deps?: unknown[];
  onClick?: (p: any) => void;
};

export default function Chart({ option, height = 280, label, table, deps = [], onClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const [asTable, setAsTable] = useState(false);
  const theme = useThemeVersion();

  useEffect(() => {
    if (!el.current || asTable) return;
    const c = echarts.init(el.current, undefined, { renderer: "svg" });
    inst.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    if (onClick) c.on("click", onClick);
    return () => { ro.disconnect(); c.dispose(); inst.current = null; };
  }, [asTable]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inst.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const o = option(readTokens()) as Record<string, unknown>;
    inst.current.setOption({ ...o, animation: reduce ? false : (o.animation ?? true) } as echarts.EChartsCoreOption, true);
  }, [theme, asTable, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {table && (
        <div className="chart-tools" style={{ justifyContent: "flex-end", marginBottom: 4 }}>
          <button className="linkbtn" onClick={() => setAsTable((x) => !x)} aria-pressed={asTable}>{asTable ? "View as chart" : "View as table"}</button>
        </div>
      )}
      {asTable && table ? (
        <div className="tablewrap" style={{ maxHeight: height + 40, overflow: "auto" }}>
          <table>
            <caption className="sr-only">{label}</caption>
            <thead><tr>{table.columns.map((c, i) => <th key={c} className={i ? "num" : ""}>{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num" : ""}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={el} className="chart" style={{ height }} role="img" aria-label={label} />
      )}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }): ReactNode {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />;
}
