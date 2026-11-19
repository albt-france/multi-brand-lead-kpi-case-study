"use client";
// Dashboard frame: left navigation rail (collapsible), top bar with global filters and trust score.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useData, PERIODS, type Period } from "@/lib/data";
import { checkScore, selectedBrands } from "@/lib/metrics";
import { brandLabel } from "@/lib/format";
import { Loading } from "./ui";
import { Logo, FOOTER } from "./brand";

// Pages of the report (ready: false would hide one from the navigation).
export const PAGES = [
  { href: "/dashboard/", label: "Overview", n: "01", ready: true },
  { href: "/dashboard/channels/", label: "Channels & spend", n: "02", ready: true },
  { href: "/dashboard/attribution/", label: "Attribution health", n: "03", ready: true },
  { href: "/dashboard/audit/", label: "Lead audit", n: "04", ready: true },
  { href: "/dashboard/reconciliation/", label: "Reconciliation", n: "05", ready: true },
  { href: "/dashboard/quality/", label: "Data quality monitor", n: "06", ready: true },
  { href: "/dashboard/lineage/", label: "Lineage & methods", n: "07", ready: true },
].filter((p) => p.ready);

export function ThemeToggle() {
  const [mode, setMode] = useState<"auto" | "light" | "dark">("auto");
  useEffect(() => { try { setMode((localStorage.getItem("lk-theme") as "light" | "dark") || "auto"); } catch { /* ignore */ } }, []);
  const next = () => {
    const m = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
    setMode(m);
    if (m === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", m);
    try { if (m === "auto") localStorage.removeItem("lk-theme"); else localStorage.setItem("lk-theme", m); } catch { /* ignore */ }
  };
  const label = mode === "auto" ? "Theme: auto" : mode === "light" ? "Theme: paper" : "Theme: night";
  return <button className="iconbtn" onClick={next} aria-label={`${label}. Change theme`} title={label}>{mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐"}<span>{mode === "auto" ? "Auto" : mode === "light" ? "Paper" : "Night"}</span></button>;
}


export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || "";
  const { data, error, filters, setFilters, range } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const here = (href: string) => path.replace(/\/?$/, "/").endsWith(href);
  const trust = data ? checkScore(data, null, selectedBrands(data, filters), range) : null;

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <a href="#main" className="skip">Skip to content</a>
      <aside className="rail" aria-label="Dashboard pages">
        <Link href="/" className="brandmark"><Logo /><div><b>Signal Ledger</b><small>Lead KPI case study</small></div></Link>
        <nav>
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="navlink" aria-current={here(p.href) ? "page" : undefined}>
              <span className="num">{p.n}</span><span>{p.label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          <a className="navlink" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/lab/`}><span className="num">↗</span><span>Tracking lab</span></a>
          <ThemeToggle />
          <button className="iconbtn" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? "»" : "«"}<span>Collapse</span></button>
        </div>
      </aside>
      <div className="main">
        <nav className="mobile-nav" aria-label="Dashboard pages">
          <Link href="/">Home</Link>
          {PAGES.map((p) => <Link key={p.href} href={p.href} aria-current={here(p.href) ? "page" : undefined}>{p.label}</Link>)}
        </nav>
        <div className="topbar" role="region" aria-label="Filters">
          <div className="filters">
            <label className="field">Brand
              <select value={filters.brand} onChange={(e) => setFilters({ brand: e.target.value })}>
                <option value="ALL">All five brands</option>
                {data?.meta.brands.map((b) => <option key={b.brand} value={b.brand}>{brandLabel(b.brand)} · {b.trade}</option>)}
              </select>
            </label>
            <label className="field">Period
              <select value={filters.period} onChange={(e) => setFilters({ period: e.target.value as Period })}>
                {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="field">Channel
              <select value={filters.channel} onChange={(e) => setFilters({ channel: e.target.value })}>
                <option value="ALL">All channels</option>
                {data?.meta.channels.map((c) => <option key={c.channel} value={c.channel}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="trust-pill" title="Share of automated checks passing for the selected brands and period">
            Data Trust Score <b>{trust && Number.isFinite(trust.score) ? Math.round(trust.score) : "–"}</b>
            <span className="tag sim" style={{ height: 20 }}>Simulated</span>
          </div>
          <div style={{ display: "none" }} className="mobile-theme"><ThemeToggle /></div>
        </div>
        <main id="main" tabIndex={-1}>
          {error ? <div className="content"><div className="empty">Could not load the data files ({error}). Run <code className="mono">npm run export</code> and reload.</div></div> : data ? children : <Loading />}
        </main>
        <footer className="sitefoot"><span>{FOOTER}</span><span>Signal Ledger · v2</span></footer>
      </div>
    </div>
  );
}
