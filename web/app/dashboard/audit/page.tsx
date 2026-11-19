"use client";
// 04 Lead audit: flagged queue with readable reasons, duplicate clusters, rule precision/recall, spam classifier.
import { useMemo, useState } from "react";
import { useData } from "@/lib/data";
import { filterRows, totals } from "@/lib/metrics";
import { n0, pct, brandLabel } from "@/lib/format";
import Chart, { base } from "@/components/Chart";
import { Card, PageHead, BrandChip, ChannelDot } from "@/components/ui";

type Q = { lead_id: string; brand: string; date: string; status: string; score: number; reasons: string[]; channel: string; duplicate_of: string | null };
type Cluster = { contact_id: string; brand: string; lead_count: number; leads: { lead_id: string; at: string; type: string; status: string; reason: string | null }[] };
type Cls = { class: string; tp: number; fp: number; fn: number; precision: number; recall: number };

const FILTERS = [["all", "All flagged"], ["spam", "Spam"], ["duplicate", "Duplicates"], ["invalid", "Invalid"], ["review", "Needs review"]] as const;
const PAGE = 12;

export default function Audit() {
  const { data, filters, range } = useData();
  const d = data!;
  const t = useMemo(() => totals(d, filterRows(d, filters, range)), [d, filters, range]);
  const [kind, setKind] = useState<(typeof FILTERS)[number][0]>("all");
  const [page, setPage] = useState(0);
  const ev = d.audit.evaluation;
  const classes: Cls[] = ev.classes;
  const sm = d.audit.spamModel;

  const queue: Q[] = useMemo(() => (d.audit.queue as Q[]).filter((q) =>
    (filters.brand === "ALL" || q.brand === filters.brand) &&
    (kind === "all" ? q.status !== "valid" : kind === "review" ? q.status === "valid" : q.status === kind)), [d, filters.brand, kind]);
  const pages = Math.max(1, Math.ceil(queue.length / PAGE));
  const shown = queue.slice(page * PAGE, page * PAGE + PAGE);
  const clusters = (d.audit.clusters as Cluster[]).filter((c) => filters.brand === "ALL" || c.brand === filters.brand).slice(0, 4);  // one recent cluster per brand
  const spam = classes.find((c) => c.class === "spam")!, dup = classes.find((c) => c.class === "duplicate")!;

  return (
    <div className="content">
      <PageHead eyebrow="04 · Lead audit"
        title={<>{pct(t.duplicates / t.submissions)} of submissions are duplicates and {pct(t.spam / t.submissions)} spam, and every flag says why</>}
        lede="Each lead gets one verdict (spam > duplicate > invalid > valid) from SQL rules. Every rule writes a readable reason and its version, so a sales manager can disagree with a flag and see exactly which rule to change." />

      <div className="grid">
        <Card span={8} id="queue" tag="sim" title="Flagged leads queue, newest first"
          sub="The last 600 flagged or borderline leads. “Needs review” = valid leads with a weak spam signal (score 0.25–0.6): kept, but worth a look."
          >
          <div className="seg" role="group" aria-label="Filter the queue" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
            {FILTERS.map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setPage(0); }}>{l}</button>)}
          </div>
          {queue.length === 0 ? <div className="empty">No flagged lead for these filters.</div> : (
            <div className="tablewrap">
              <table>
                <caption className="sr-only">Flagged leads with verdict, score and reasons</caption>
                <thead><tr><th>Lead</th><th>Brand</th><th>Date</th><th>Verdict</th><th className="num">Spam score</th><th>Reasons</th></tr></thead>
                <tbody>
                  {shown.map((q) => (
                    <tr key={q.lead_id}>
                      <td className="mono">{q.lead_id}</td>
                      <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ChannelDot ch={q.channel} /><span className="mono">{brandLabel(q.brand)}</span></span></td>
                      <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{q.date}</td>
                      <td><span className={`status ${q.status}`}>{q.status === "valid" ? "review" : q.status}</span></td>
                      <td className="num mono">{q.score ? q.score.toFixed(2) : "–"}</td>
                      <td><div className="reasons">{q.reasons.slice(0, 3).map((r) => <span key={r} className="reason">{r}</span>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-foot">
            <span>{n0(queue.length)} leads · page {page + 1} of {pages}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="iconbtn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">←</button>
              <button className="iconbtn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">→</button>
            </span>
          </div>
        </Card>

        <Card span={4} id="rules" tag="sim" title={`Spam rules catch ${pct(spam.recall, 0)} of spam with ${pct(1 - spam.precision, 1)} false alarms`}
          sub="Scored against the simulation's hidden answer key (never published). Precision = flags that were right; recall = problems found.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Verdict</th><th className="num">Precision</th><th className="num">Recall</th><th className="num">Missed</th></tr></thead>
              <tbody>{classes.map((c) => (
                <tr key={c.class}><td><span className={`status ${c.class}`}>{c.class}</span></td>
                  <td className="num mono">{pct(c.precision)}</td><td className="num mono">{pct(c.recall)}</td><td className="num mono">{n0(c.fn)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="callout">Missed spam is mostly bots that used a <strong>real-looking US number and a clean inbox</strong>: only one weak signal, below the 0.6 threshold on purpose. Missed duplicates ({n0(dup.fn)}) are people who came back with <strong>another phone and another e-mail</strong>: no rule can link them, so they are reported as a known limit.</p>
          <RuleBars />
        </Card>

        <Card span={7} id="clusters" tag="sim" title="Duplicate clusters: one person, several records"
          sub="Each cluster is one contact. The first record is kept; the others are linked to it with the reason, never deleted.">
          {clusters.length === 0 ? <div className="empty">No duplicate cluster for this brand.</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {clusters.map((c) => (
                <div key={c.contact_id} style={{ border: "1px solid var(--rule-soft)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span className="mono" style={{ fontSize: 12 }}>{c.contact_id}</span><BrandChip code={c.brand} /></div>
                  <ol className="lineage">
                    {c.leads.map((l, i) => (
                      <li key={l.lead_id} style={{ paddingBottom: 10 }} className={i === 0 ? "final" : ""}>
                        <span className="node">{i + 1}</span>
                        <div style={{ fontSize: 13 }}><span className="mono">{l.lead_id}</span> · {l.type} · <span className="muted mono">{l.at}</span></div>
                        <div style={{ fontSize: 12.5 }} className="ink2">{i === 0 ? "kept as the contact's first lead" : l.reason}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card span={5} id="classifier" tag="public" title={`Text classifier: ${pct(sm.precision, 1)} precision, ${pct(sm.recall, 1)} recall on real labelled messages`}
          sub="TF-IDF + logistic regression trained on the UCI SMS Spam Collection (5,574 labelled SMS, CC BY 4.0), evaluated on a held-out 20% test set.">
          <div className="stats">
            <div className="stat"><div className="v">{sm.tp}</div><div className="l">spam caught (test set)</div></div>
            <div className="stat"><div className="v">{sm.fp}</div><div className="l">real messages wrongly flagged</div></div>
            <div className="stat"><div className="v">{sm.fn}</div><div className="l">spam missed</div></div>
            <div className="stat"><div className="v">{sm.roc_auc}</div><div className="l">ROC AUC</div></div>
          </div>
          <p className="callout">Honest limit: these are <strong>SMS, not web forms</strong>. On the form “message” field the score is a <strong>secondary signal only</strong> (weight 0.25): it can push a suspicious lead over the line, never flag one on its own. {n0(sm.form_messages_above_0_8)} of {n0(sm.form_messages_scored)} simulated messages scored above 0.8.</p>
        </Card>
      </div>
    </div>
  );
}

function RuleBars() {
  const { data } = useData();
  const rc = (data!.audit.ruleCounts as { rule_id: string; flag_type: string; n: number }[]);
  const color: Record<string, string> = { spam: "signal", duplicate: "info", invalid: "attention" };
  return (
    <Chart height={210} label="Number of leads each audit rule flagged" deps={[]}
      table={{ columns: ["Rule", "Leads flagged"], rows: rc.map((r) => [r.rule_id, r.n]) }}
      option={(tk) => {
        const bs = base(tk);
        const rows = [...rc].reverse();
        return {
          ...bs, grid: { left: 128, right: 44, top: 4, bottom: 4 },
          tooltip: { ...bs.tooltip, trigger: "item" },
          xAxis: bs.xAxis({ type: "value", show: false }),
          yAxis: bs.yAxis({ type: "category", data: rows.map((r) => r.rule_id), axisLabel: { ...bs.font, fontFamily: "JetBrains Mono" }, splitLine: { show: false } }),
          series: [{ type: "bar", data: rows.map((r) => ({ value: r.n, itemStyle: { color: tk[color[r.flag_type]], borderRadius: [0, 4, 4, 0] } })), barWidth: 10,
            label: { show: true, position: "right", color: tk.ink2, fontSize: 11, formatter: (p: any) => n0(p.value) } }],
        };
      }} />
  );
}
