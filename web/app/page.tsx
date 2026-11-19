// Cover = report overview page (same layout as a Power BI "Overview" page).
// Numbers are read at build time from the exported JSON (no hand-typed figures).
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
  const inc = incidents as { incident_no: number; kind: string }[];
  const kpis = [
    { tag: "Simulated · Lead audit", v: n0(totals.submissions), l: `lead submissions audited; ${n0(totals.qualified)} are real, reachable leads` },
    { tag: "Simulated · Data quality", v: String(inc.length), l: `hidden incidents traced to a root cause, ${inc.filter((i) => i.kind === "false_signal").length} of them a false alarm` },
    { tag: "Simulated · Attribution", v: `${(ev.corrected_accuracy * 100).toFixed(1)}%`, l: `of leads on the right channel after correction (CRM label alone: ${(ev.raw_accuracy * 100).toFixed(1)}%)` },
    { tag: "Simulated · Reconciliation", v: "6", l: "systems reconciled daily: CRM, Google Ads, LSA, Meta, GA4, call sheet" },
  ];
  const questions = [
    ["Leads", "How many leads are real, and how many are duplicates, spam or invalid?", "/dashboard/audit/"],
    ["Attribution", "Which channel really brought each lead when UTMs and click ids go missing?", "/dashboard/attribution/"],
    ["Reconciliation", "Why do Google Ads, Meta, LSA and GA4 never match the CRM?", "/dashboard/reconciliation/"],
    ["Spend", "What does a lead cost per channel and brand, net of LSA credits?", "/dashboard/channels/"],
    ["Monitoring", "Which checks failed, when, and is a spike a bug or real demand?", "/dashboard/quality/"],
  ];
  return (
    <div className="cover">
      <header className="cover-top">
        <span className="brandmark" style={{ padding: 0 }}><Logo /><div><b>Signal Ledger</b><small>Lead KPI case study</small></div></span>
        <ThemeToggle />
      </header>
      <main className="cover-inner" id="main">
        <div className="eyebrow">Overview <span className="tag sim">Simulated</span></div>
        <h1>One source of truth for leads: auditing, attributing and reconciling five brands</h1>
        <p className="lede">
          A multi-brand US local-services group (fictional; sector inferred from the role description) runs five brands on Google Ads,
          Local Services Ads, Meta and a CRM. Every lead is audited, its attribution corrected, each platform reconciled against the CRM
          and history protected, in PostgreSQL (Supabase format), with this dashboard on top.
        </p>
        <div className="grid">
          {kpis.map((k) => (
            <section key={k.tag} className="card span-3" style={{ minHeight: 150 }}>
              <div className="eyebrow">{k.tag}</div>
              <div className="bigkpi">{k.v}</div>
              <p className="ink2" style={{ fontSize: 13.5 }}>{k.l}</p>
            </section>
          ))}
          <section className="card span-7">
            <h2>Business questions</h2>
            <ol className="qlist">
              {questions.map(([k, q, href], i) => (
                <li key={k}><Link href={href} style={{ textDecoration: "none" }}><b>{i + 1} · {k}</b></Link>{q}</li>
              ))}
            </ol>
            <div className="cta" style={{ marginTop: 6 }}>
              <Link className="btn primary" href="/dashboard/">Open the dashboard</Link>
              <Link className="btn ghost" href="/dashboard/reconciliation/">See a reconciliation</Link>
              <a className="btn ghost" href="lab/">Tracking lab</a>
            </div>
          </section>
          <section className="card span-5">
            <h2>Data &amp; methods</h2>
            <ul className="qlist">
              <li><b>Simulated</b>Five fictional brands, six source systems in realistic export formats, 18 months, seed 42.</li>
              <li><b>Public</b>Open-Meteo weather, US Census population, Google&apos;s GA4 sample, a disposable-domain list, the UCI SMS Spam corpus.</li>
              <li><b>SQL</b>PostgreSQL migrations, one audit rule per file, SCD2 channel map, monthly snapshots, 11 automated checks.</li>
              <li><b>TypeScript</b>Loader, webhook intake, tracking capture, tests; Next.js static dashboard.</li>
            </ul>
            <div className="brandrow" aria-label="The five fictional brands">
              {meta.brands.map((b) => <span key={b.brand} className="chip" title={`${b.trade}, ${b.city}`}>{b.brand.replace("-", "·")}</span>)}
            </div>
          </section>
        </div>
      </main>
      <footer className="sitefoot"><span>{FOOTER}</span><span>Signal Ledger · v2</span></footer>
    </div>
  );
}
