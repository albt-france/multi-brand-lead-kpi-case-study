// Number formatting used everywhere (tabular figures come from CSS).
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const n0 = (v: number) => (Number.isFinite(v) ? nf0.format(v) : "–");
export const n1 = (v: number) => (Number.isFinite(v) ? nf1.format(v) : "–");
export const usd = (v: number) => (Number.isFinite(v) ? "$" + nf0.format(v) : "–");
export const usdK = (v: number) => (!Number.isFinite(v) ? "–" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(0)}k` : usd(v));
export const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "–");
export const brandLabel = (code: string) => code.replace("-", "·");
export const monthLabel = (ym: string) => new Date(ym.slice(0, 7) + "-01T00:00:00Z").toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
export const dateLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
