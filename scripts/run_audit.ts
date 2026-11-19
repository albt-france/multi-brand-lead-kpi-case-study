// npm run audit
// Runs every audit rule (db/audit/*.sql, in file order), then the checks, snapshots and incident log.
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, runSqlFile, ROOT } from "./lib/db.ts";

const db = await openDb();
const rules = readdirSync(resolve(ROOT, "db/audit")).filter((f) => f.endsWith(".sql")).sort();
for (const f of rules) await runSqlFile(db, `db/audit/${f}`);
for (const f of ["60_checks.sql", "70_snapshots.sql", "80_incident_log.sql"]) {
  if (existsSync(resolve(ROOT, "db/transforms", f))) await runSqlFile(db, `db/transforms/${f}`);
}
const s = await db.query<{ status: string; n: number }>(
  `SELECT status, count(*)::int n FROM audit.lead_status GROUP BY 1 ORDER BY 2 DESC`);
console.log("lead status:", s.rows.map((r) => `${r.status}=${r.n}`).join("  "));
await db.close();
