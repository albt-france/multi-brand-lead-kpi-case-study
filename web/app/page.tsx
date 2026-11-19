// Cover page. Numbers are read at build time from the exported JSON (no hand-typed figures).
import Link from "next/link";
import totals from "../public/data/totals.json";
import incidents from "../public/data/incidents.json";
import audit from "../public/data/audit.json";
import meta from "../public/data/meta.json";
import { ThemeToggle } from "@/components/Shell";
import { Logo, FOOTER } from "@/components/brand";

const n0 = (v: number) => new Intl.NumberFormat("en-US").format(v);

export default function Cover() {
  const ev = audit.evaluation.attribution as { raw_accuracy: number; corrected_accuracy: number };
  const falseAlarms = (incidents as { kind: string }[]).filter((i) => i.kind === "false_signal").length;
  const rows = [
    { v: n0(totals.submissions), l: "lead submissions audited, each with a readable verdict", n: "01" },
    { v: String((incidents as unknown[]).length), l: `hidden incidents traced to a root cause, ${falseAlarms} of them a false alarm left uncorrected`, n: "02" },
    { v: `${(ev.corrected_accuracy * 100).toFixed(1)}%`, l: `of leads attributed to the right channel after correction (CRM label alone: ${(ev.raw_accuracy * 100).toFixed(1)}%)`, n: "03" },
    { v: "6", l: "systems reconciled every day: CRM, Google Ads, LSA, Meta, GA4 and a hand-typed call sheet", n: "04" },
  ];
  return (
    <div className="cover">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px clamp(16px, 6vw, 88px)", maxWidth: 1440, margin: "0 auto", width: "100%" }}>
        <span className="brandmark" style={{ padding: 0 }}><Logo /><div><b>Signal Ledger</b><small>Lead KPI case study</small></div></span>
        <ThemeToggle />
      </header>
      <main className="cover-inner" id="main">
        <div>
          <div className="eyebrow">Case study · multi-brand lead data · <span className="tag sim" style={{ height: 20 }}>Simulated</span></div>
          <h1 style={{ marginTop: 18 }}>One source of truth for leads, <em>traced back to every source.</em></h1>
          <p className="lede">
            A multi-brand US local-services group (fictional; sector inferred from the role description) runs five brands on
            Google Ads, Local Services Ads, Meta and a CRM. This project audits every lead, corrects its attribution, reconciles
            each platform against the CRM and protects history, in PostgreSQL (Supabase-ready) with a dashboard on top.
          </p>
          <div className="cta">
            <Link className="btn primary" href="/dashboard/">Open the dashboard <span aria-hidden="true">→</span></Link>
            <Link className="btn ghost" href="/dashboard/reconciliation/">See a reconciliation</Link>
          </div>
          <div className="brandrow" aria-label="The five fictional brands">
            {meta.brands.map((b) => <span key={b.brand} className="chip" title={`${b.trade}, ${b.city}`}>{b.brand.replace("-", "·")}</span>)}
          </div>
        </div>
        <div className="ledger" role="list" aria-label="Key figures">
          {rows.map((r) => (
            <div key={r.n} className="ledger-row" role="listitem">
              <span className="incno" style={{ color: "var(--ink-3)" }}>{r.n}</span>
              <span className="l">{r.l}</span>
              <span className="v">{r.v}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, padding: "10px 22px 6px" }}>
            Simulated lead data, seeded with real PUBLIC DATA: Open-Meteo weather, US Census population, Google&apos;s GA4 sample, a public spam corpus.
          </p>
        </div>
      </main>
      <footer className="sitefoot"><span>{FOOTER}</span><span className="mono">Signal Ledger · v1</span></footer>
    </div>
  );
}
