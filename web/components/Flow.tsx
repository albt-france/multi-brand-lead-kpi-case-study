// Data-flow diagram (inline SVG, theme tokens), used on the Lineage page and in the PDF report.
const LAYERS = [
  { x: 20, title: "Sources", items: ["CRM export (UTC)", "Google Ads", "Local Services Ads", "Meta Ads", "GA4 events", "Call sheet", "Form webhooks"] },
  { x: 230, title: "raw", items: ["one table per system", "all text, never edited", "webhooks as jsonb", "idempotent dedup_key"] },
  { x: 420, title: "staging / core", items: ["phones → E.164", "local day + UTC day", "leads · contacts", "touches · spend_daily", "channel_map_scd2"] },
  { x: 610, title: "audit", items: ["lead_flags + reasons", "lead_status", "check_results", "kpi_snapshots", "incidents"] },
  { x: 800, title: "marts", items: ["kpi_daily_brand", "reconciliation_daily", "recon_cascade", "attribution_health", "history_check"] },
  { x: 990, title: "Outputs", items: ["JSON → this dashboard", "Looker Studio CSV", "PDF report", "dated backups"] },
];

export default function Flow() {
  const W = 1180, H = 300;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Data flow: sources to raw, staging and core, audit, marts, then dashboard, Looker Studio and PDF" style={{ width: "100%", height: "auto", minWidth: 760 }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--ink-3)" /></marker>
      </defs>
      {LAYERS.map((l, i) => (
        <g key={l.title}>
          <rect x={l.x} y={20} width={170} height={250} rx={6} fill={i === 0 || i === 5 ? "var(--surface-2)" : "var(--surface)"} stroke={i === 3 ? "var(--signal)" : "var(--rule)"} />
          <text x={l.x + 14} y={46} fontSize={13} fontWeight={700} fill="var(--ink)">{l.title}</text>
          {l.items.map((it, k) => <text key={it} x={l.x + 14} y={76 + k * 26} fontSize={12} fill="var(--ink-2)">{it}</text>)}
          {i < LAYERS.length - 1 && <line x1={l.x + 172} y1={145} x2={LAYERS[i + 1].x - 4} y2={145} stroke="var(--ink-3)" strokeWidth={1.5} markerEnd="url(#arr)" />}
        </g>
      ))}
      <text x={610} y={292} fontSize={11} fill="var(--ink-3)">PostgreSQL (Supabase format), run locally in PGlite · every step is a .sql file in db/</text>
    </svg>
  );
}

