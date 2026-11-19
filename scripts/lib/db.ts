// Small helpers around PGlite: a real PostgreSQL compiled to WebAssembly, running inside Node.
// The database lives in data/pgdata (a normal Postgres data directory). No server, no Docker.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const PGDATA = resolve(ROOT, "data", "pgdata");

export async function openDb(dir: string = PGDATA): Promise<PGlite> {
  const db = new PGlite(dir);
  await db.waitReady;
  return db;
}

/** Runs one .sql file and prints how long it took. */
export async function runSqlFile(db: PGlite, relPath: string): Promise<void> {
  const t = Date.now();
  await db.exec(readFileSync(resolve(ROOT, relPath), "utf8"));
  console.log(`  ok  ${relPath}  (${Date.now() - t} ms)`);
}

/** Loads a CSV file (with header) into an existing table using PostgreSQL COPY. */
export async function copyCsv(db: PGlite, table: string, relPath: string): Promise<number> {
  const csv = readFileSync(resolve(ROOT, relPath));
  await db.query(`COPY ${table} FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], { blob: new Blob([csv]) });
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r.rows[0].n;
}

/** Quotes a value for a CSV line. */
export const csvCell = (v: unknown) => (v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`);
