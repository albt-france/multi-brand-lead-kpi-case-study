"use client";
// KPI tile with a trust badge and the "Trace" drawer that shows the number's lineage.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LINEAGE } from "@/lib/lineage";
import type { Trust } from "@/lib/metrics";
import { useData } from "@/lib/data";
import { checkScore, selectedBrands } from "@/lib/metrics";
import { TrustBadge } from "./ui";
import { pct } from "@/lib/format";

export function KpiTile({ id, value, sub, trust, trustNote, delay = 0 }: { id: string; value: string; sub?: string; trust: Trust; trustNote?: string; delay?: number }) {
  const [open, setOpen] = useState(false);
  const def = LINEAGE[id];
  return (
    <div className="kpi" style={{ animationDelay: `${delay}ms` }}>
      <div className="label"><span>{def.title}</span></div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
      <div className="row">
        <TrustBadge trust={trust} title={trustNote} />
        <button className="trace-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Trace ${def.title}`}>Trace</button>
      </div>
      {open && <TraceDrawer id={id} value={value} trust={trust} trustNote={trustNote} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function TraceDrawer({ id, value, trust, trustNote, onClose }: { id: string; value: string; trust: Trust; trustNote?: string; onClose: () => void }) {
  const def = LINEAGE[id];
  const { data, filters, range } = useData();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!data) return null;
  const brands = selectedBrands(data, filters);
  const checkName = (c: string) => data.meta.checks.find((x) => x.check_id === c)?.name ?? c;
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="trace-title">
        <header>
          <div>
            <div className="eyebrow">Trace · lineage</div>
            <h2 id="trace-title" style={{ marginTop: 6 }}>{def.title}: {value}</h2>
            <p className="card-sub">{def.definition}</p>
            <div style={{ marginTop: 8 }}><TrustBadge trust={trust} /> {trustNote && <span className="muted" style={{ fontSize: 12 }}> · {trustNote}</span>}</div>
          </div>
          <button ref={closeRef} className="iconbtn" onClick={onClose} aria-label="Close trace">✕</button>
        </header>
        <div className="body">
          <ol className="lineage">
            {def.steps.map((s, i) => (
              <li key={i} className={s.kind === "Value" ? "final" : ""}>
                <span className="node">{i + 1}</span>
                <div className="kind">{s.kind}</div>
                <div className="what">{s.what}</div>
                {s.code && <div style={{ marginTop: 4 }}><code>{s.code}</code></div>}
                {s.checks && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
                    {s.checks.map((c) => {
                      const sc = checkScore(data, [c], brands, range);
                      return (
                        <li key={c} style={{ padding: 0, fontSize: 13 }}>
                          <span className="mono">{c}</span> {checkName(c)} · <b>{pct(sc.passRate, 0)}</b> of {sc.n} runs passed
                          {sc.fail > 0 && <span className="status fail" style={{ marginLeft: 6 }}>{sc.fail} failed</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Filters: {filters.brand === "ALL" ? "all brands" : filters.brand.replace("-", "·")}, {data.meta.dates[range[0]]} → {data.meta.dates[range[1]]}{filters.channel !== "ALL" ? `, channel ${filters.channel}` : ""}. SIMULATED data.</p>
        </div>
      </aside>
    </>,
    document.body,
  );
}
