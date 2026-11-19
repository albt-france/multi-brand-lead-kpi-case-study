// npm run backup
// Exports every table of the core, audit and marts layers to dated CSV files: backups/YYYY-MM-DD/<schema>.<table>.csv
// plus a manifest with row counts, so a restore can be checked. On Supabase the same is done with
// `pg_dump` / scheduled backups; this script is the portable, readable version.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, ROOT } from "./lib/db.ts";

const day = new Date().toISOString().slice(0, 10);
const dir = resolve(ROOT, "backups", day);
mkdirSync(dir, { recursive: true });
const db = await openDb();

const tables = (await db.query<{ s: string; t: string }>(`
  SELECT table_schema s, table_name t FROM information_schema.tables
  WHERE table_schema IN ('core', 'audit') AND table_type = 'BASE TABLE' ORDER BY 1, 2`)).rows;
const manifest: { table: string; rows: number; file: string }[] = [];
for (const { s, t } of tables) {
  // COPY ... TO '/dev/blob' returns the CSV as a Blob (PGlite feature): no file access from the database.
  const r = await db.query(`COPY ${s}.${t} TO '/dev/blob' WITH (FORMAT csv, HEADER true)`);
  const text = r.blob ? await r.blob.text() : "";
  const file = `${s}.${t}.csv`;
  writeFileSync(resolve(dir, file), text);
  manifest.push({ table: `${s}.${t}`, rows: Math.max(0, text.split("\n").filter(Boolean).length - 1), file });
}
writeFileSync(resolve(dir, "manifest.json"), JSON.stringify({ created: new Date().toISOString(), tables: manifest }, null, 1));
console.log(`${manifest.length} tables backed up to backups/${day}`);
await db.close();
