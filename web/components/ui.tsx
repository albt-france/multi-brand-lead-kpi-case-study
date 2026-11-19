"use client";
// Small building blocks: data tags, trust badges, brand capsules, channel dots, cards.
import type { ReactNode } from "react";
import { brandLabel } from "@/lib/format";
import type { Trust } from "@/lib/metrics";

export function DataTag({ kind }: { kind: "public" | "sim" }) {
  return kind === "public"
    ? <span className="tag public" title="Real public data (source and licence on the Lineage & methods page)">Public data</span>
    : <span className="tag sim" title="Simulated data: fictional brands and systems">Simulated</span>;
}

/** Trust badge: shape + word, never color alone. Filled dot = Verified, ring = Reconciled, triangle = At risk. */
export function TrustBadge({ trust, title }: { trust: Trust; title?: string }) {
  const label = trust === "verified" ? "Verified" : trust === "reconciled" ? "Reconciled" : "At risk";
  const icon = trust === "verified"
    ? <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" fill="currentColor" /></svg>
    : trust === "reconciled"
      ? <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      : <svg width="11" height="10" aria-hidden="true"><path d="M5.5 .8 10.4 9.3H.6z" fill="currentColor" /></svg>;
  return <span className={`badge ${trust}`} title={title}>{icon}{label}</span>;
}

export const BrandChip = ({ code }: { code: string }) => <span className="chip">{code === "ALL" ? "ALL BRANDS" : brandLabel(code)}</span>;

export const ChannelDot = ({ ch }: { ch: string }) => <span className="chdot" style={{ background: `var(--ch-${ch})` }} aria-hidden="true" />;

export function Card({ title, sub, tag, span = 12, children, foot, id, right }: {
  title: ReactNode; sub?: ReactNode; tag?: "public" | "sim" | null; span?: number; children: ReactNode; foot?: ReactNode; id?: string; right?: ReactNode;
}) {
  return (
    <section className={`card span-${span}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="card-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id={id ? `${id}-h` : undefined} style={{ fontSize: 19 }}>{title}</h2>
          {sub && <p className="card-sub">{sub}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}{tag && <DataTag kind={tag} />}</div>
      </div>
      {children}
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function PageHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

export const IncNo = ({ n }: { n: number }) => <span className="incno">#{String(n).padStart(2, "0")}</span>;
export const Foot = ({ n }: { n: number }) => <a className="footnote" href={`#inc-${n}`} title={`Incident #${String(n).padStart(2, "0")}`}>#{String(n).padStart(2, "0")}</a>;

export function Loading() {
  return (
    <div className="content" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading data…</span>
      <div className="skeleton" style={{ height: 28, width: 220 }} />
      <div className="skeleton" style={{ height: 48, width: "70%" }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="grid"><div className="skeleton span-8" style={{ height: 300 }} /><div className="skeleton span-4" style={{ height: 300 }} /></div>
    </div>
  );
}
