// Aggregations over the daily mart. Same definitions as docs/KPI_DEFINITIONS.md.
import type { Data, DailyRow, Filters } from "./data";

export const COL = { date: 0, brand: 1, channel: 2, submissions: 3, leads: 4, qualified: 5, spam: 6, duplicates: 7, invalid: 8, booked: 9, spend: 10, spendGross: 11, credits: 12, platformLeads: 13, revenue: 14 } as const;
export type Totals = { submissions: number; leads: number; qualified: number; spam: number; duplicates: number; invalid: number; booked: number; spend: number; spendGross: number; credits: number; paidLeads: number; paidQualified: number; revenue: number };

export function brandIndex(data: Data, brand: string) { return data.meta.brands.findIndex((b) => b.brand === brand); }
export function channelIndex(data: Data, ch: string) { return data.meta.channels.findIndex((c) => c.channel === ch); }

/** Rows matching the global filters (brand, channel, period). */
export function filterRows(data: Data, f: Filters, range: [number, number], opts: { ignoreChannel?: boolean; ignoreBrand?: boolean } = {}): DailyRow[] {
  const b = f.brand === "ALL" || opts.ignoreBrand ? -1 : brandIndex(data, f.brand);
  const c = f.channel === "ALL" || opts.ignoreChannel ? -1 : channelIndex(data, f.channel);
  return data.daily.filter((r) => r[0] >= range[0] && r[0] <= range[1] && (b < 0 || r[1] === b) && (c < 0 || r[2] === c));
}

export function totals(data: Data, rows: DailyRow[]): Totals {
  const paid = new Set(data.meta.channels.map((c, i) => (c.is_paid ? i : -1)).filter((i) => i >= 0));
  const t: Totals = { submissions: 0, leads: 0, qualified: 0, spam: 0, duplicates: 0, invalid: 0, booked: 0, spend: 0, spendGross: 0, credits: 0, paidLeads: 0, paidQualified: 0, revenue: 0 };
  for (const r of rows) {
    t.submissions += r[3]; t.leads += r[4]; t.qualified += r[5]; t.spam += r[6]; t.duplicates += r[7]; t.invalid += r[8];
    t.booked += r[9]; t.spend += r[10]; t.spendGross += r[11]; t.credits += r[12]; t.revenue += r[14];
    if (paid.has(r[2])) { t.paidLeads += r[4]; t.paidQualified += r[5]; }
  }
  return t;
}

/** Sums one column by ISO week (Monday) or month. Returns [label, value] pairs in order. */
export function series(data: Data, rows: DailyRow[], col: number, grain: "week" | "month" | "day" = "week", range?: [number, number]): [string, number][] {
  const out = new Map<string, number>();
  const key = (i: number) => {
    const d = data.meta.dates[i];
    if (grain === "day") return d;
    if (grain === "month") return d.slice(0, 7);
    const dt = new Date(d + "T00:00:00Z"); const dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
  };
  if (range) for (let i = range[0]; i <= range[1]; i++) out.set(key(i), 0);
  for (const r of rows) out.set(key(r[0]), (out.get(key(r[0])) ?? 0) + r[col]);
  return [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Check pass-rate summary over a period for some brands. pass/explained = 1, warn = 0.5, fail = 0, n/a ignored. */
export function checkScore(data: Data, checkIds: string[] | null, brands: string[], range: [number, number]) {
  let pts = 0, n = 0, fail = 0, warn = 0, pass = 0, expl = 0;
  for (const [cid, byBrand] of Object.entries(data.checks.status)) {
    if (checkIds && !checkIds.includes(cid)) continue;
    for (const [b, s] of Object.entries(byBrand)) {
      if (b !== "ALL" && !brands.includes(b)) continue;
      for (let i = range[0]; i <= range[1]; i++) {
        const c = s[i];
        if (c === "p") { pts += 1; pass++; } else if (c === "e") { pts += 1; expl++; } else if (c === "w") { pts += .5; warn++; } else if (c === "f") { fail++; } else continue;
        n++;
      }
    }
  }
  return { score: n ? (100 * pts) / n : NaN, n, pass, warn, fail, expl, passRate: n ? (pass + expl) / n : NaN };
}

export type Trust = "verified" | "reconciled" | "atrisk";
export function trustOf(rate: number, good: Trust = "verified", threshold = 0.95): Trust {
  return !Number.isFinite(rate) ? good : rate >= threshold ? good : "atrisk";
}

export const selectedBrands = (data: Data, f: Filters) => (f.brand === "ALL" ? data.meta.brands.map((b) => b.brand) : [f.brand]);
