// npm run db:build
// Creates the database from scratch: migrations -> load raw exports -> normalize phones -> core tables.
import { rmSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, runSqlFile, copyCsv, csvCell, PGDATA, ROOT } from "./lib/db.ts";
import { normalizePhone } from "../lib/normalize.ts";

const MIGRATIONS = ["001_schemas", "002_raw", "003_core", "004_audit", "005_marts", "006_rls_example"];
const RAW_FILES: [string, string][] = [
  ["raw.crm_contacts", "data/sim/crm_contacts.csv"],
  ["raw.google_ads_daily", "data/sim/google_ads_daily.csv"],
  ["raw.lsa_leads", "data/sim/lsa_leads.csv"],
  ["raw.meta_ads_daily", "data/sim/meta_ads_daily.csv"],
  ["raw.ga4_events_daily", "data/sim/ga4_events_daily.csv"],
  ["raw.manual_calls_sheet", "data/sim/manual_calls_sheet.csv"],
  ["raw.brands", "data/sim/brands.csv"],
  ["raw.weather_daily", "data/sim/weather_daily.csv"],
  ["raw.message_scores", "data/derived/message_scores.csv"],
];

rmSync(PGDATA, { recursive: true, force: true });
const db = await openDb();

console.log("1. migrations");
await runSqlFile(db, "db/support/supabase_stub.sql");
for (const m of MIGRATIONS) await runSqlFile(db, `db/migrations/${m}.sql`);

console.log("2. raw exports");
for (const [table, file] of RAW_FILES) {
  if (!existsSync(resolve(ROOT, file))) throw new Error(`missing ${file}: run the Python pipeline first`);
  console.log(`  ${String(await copyCsv(db, table, file)).padStart(6)} rows  ${table}`);
}
const domains = readFileSync(resolve(ROOT, "data/raw/disposable_domains.txt"), "utf8").split(/\r?\n/).filter(Boolean);
await db.query(`COPY raw.disposable_domains FROM '/dev/blob' WITH (FORMAT csv)`, [], { blob: new Blob([[...new Set(domains)].join("\n")]) });
console.log(`  ${String(domains.length).padStart(6)} rows  raw.disposable_domains`);

console.log("3. phone normalization (libphonenumber)");
const phones = await db.query<{ p: string }>(`
  SELECT phone AS p FROM raw.crm_contacts WHERE phone <> ''
  UNION SELECT caller_phone FROM raw.manual_calls_sheet WHERE caller_phone <> ''
  UNION SELECT consumer_phone FROM raw.lsa_leads WHERE consumer_phone <> ''`);
const lines = phones.rows.map(({ p }) => {
  const n = normalizePhone(p);
  return [p, n.e164, n.country, n.valid].map(csvCell).join(",");
});
await db.query(`COPY staging.phone_norm FROM '/dev/blob' WITH (FORMAT csv)`, [], { blob: new Blob([lines.join("\n")]) });
console.log(`  ${String(lines.length).padStart(6)} distinct phone strings`);

console.log("4. core");
await runSqlFile(db, "db/transforms/10_core.sql");
const n = await db.query<{ t: string; n: number }>(`
  SELECT 'core.leads' t, count(*)::int n FROM core.leads UNION ALL
  SELECT 'core.spend_daily', count(*)::int FROM core.spend_daily UNION ALL
  SELECT 'core.calls_sheet', count(*)::int FROM core.calls_sheet`);
n.rows.forEach((r) => console.log(`  ${String(r.n).padStart(6)} rows  ${r.t}`));
await db.close();
