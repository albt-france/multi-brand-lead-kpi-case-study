"use client";
// Loads the pre-computed JSON (web/public/data, written by scripts/export_marts.ts) once,
// and keeps the global filters (brand, period, channel) shared by every page.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export type Brand = { brand: string; trade: string; city: string; county: string; population_2025: number; tz: string };
export type Channel = { channel: string; label: string; is_paid: boolean };
export type Check = { check_id: string; name: string; rule: string; threshold: string; window_days: number; runbook: string };
export type Meta = { brands: Brand[]; channels: Channel[]; dates: string[]; checks: Check[]; generated: string };
/** [date, brand, channel, submissions, leads, qualified, spam, duplicates, invalid, booked, spend, spend_gross, credits, platform_leads, revenue] */
export type DailyRow = number[];
export type Incident = {
  incident_no: number; title: string; brand: string; start_date: string; end_date: string; kind: string;
  symptom: string; root_cause: string; evidence: string; impact: string; fix: string; status: string;
};
export type Checks = { status: Record<string, Record<string, string>>; observed: Record<string, Record<string, (number | null)[]>>; notes: { check: string; brand: string; date: string; note: string }[] };

export type Data = {
  meta: Meta; daily: DailyRow[]; checks: Checks; incidents: Incident[];
  audit: any; recon: any; attribution: any; weather: Record<string, { t: number[]; r: number[] }>; totals: any;
};

const FILES = ["meta", "daily", "checks", "incidents", "audit", "recon", "attribution", "weather", "totals"] as const;

export type Period = "all" | "12m" | "6m" | "90d" | "30d";
export const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "all", label: "All 18 months", days: 9999 }, { id: "12m", label: "Last 12 months", days: 365 },
  { id: "6m", label: "Last 6 months", days: 183 }, { id: "90d", label: "Last 90 days", days: 90 }, { id: "30d", label: "Last 30 days", days: 30 },
];
export type Filters = { brand: string; period: Period; channel: string };

type Ctx = { data: Data | null; error: string | null; filters: Filters; setFilters: (f: Partial<Filters>) => void; range: [number, number] };
const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setF] = useState<Filters>({ brand: "ALL", period: "all", channel: "ALL" });

  useEffect(() => {
    try { const s = localStorage.getItem("lk-filters"); if (s) setF((f) => ({ ...f, ...JSON.parse(s) })); } catch { /* storage blocked: defaults */ }
    Promise.all(FILES.map((f) => fetch(`${BASE}/data/${f}.json`).then((r) => { if (!r.ok) throw new Error(`${f}.json ${r.status}`); return r.json(); })))
      .then((parts) => setData(Object.fromEntries(FILES.map((f, i) => [f, parts[i]])) as Data))
      .catch((e) => setError(String(e)));
  }, []);

  const setFilters = (f: Partial<Filters>) => setF((old) => {
    const next = { ...old, ...f };
    try { localStorage.setItem("lk-filters", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const range = useMemo<[number, number]>(() => {
    const n = data?.meta.dates.length ?? 549;
    const days = PERIODS.find((p) => p.id === filters.period)?.days ?? 9999;
    return [Math.max(0, n - days), n - 1];
  }, [data, filters.period]);

  return <DataCtx.Provider value={{ data, error, filters, setFilters, range }}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}
