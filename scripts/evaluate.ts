// npm run evaluate
// Scores the audit rules and the attribution against the simulation's hidden answer key.
// The answer key (data/_hidden_truth_leads.csv) is NOT published; only the scores are
// (data/derived/evaluation.json), so anyone can rerun simulate.py and reproduce them.
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, copyCsv, ROOT } from "./lib/db.ts";

const TRUTH = "data/_hidden_truth_leads.csv";
if (!existsSync(resolve(ROOT, TRUTH))) {
  console.log("No answer key found (run pipeline/simulate.py). Keeping the published evaluation.json.");
  process.exit(0);
}
const db = await openDb();
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS eval;
  DROP TABLE IF EXISTS eval.truth;
  CREATE TABLE eval.truth (lead_id text PRIMARY KEY, brand text, true_channel text, is_spam boolean, spam_kind text,
    is_invalid boolean, dup_type text, dup_of_id text, inc_utm_redirect boolean, inc_gclid_missing boolean, click_local_date date);`);
await copyCsv(db, "eval.truth", TRUTH);

// Truth label with the same precedence as the audit: spam > duplicate > invalid > valid.
const q = (sql: string) => db.query<Record<string, number | string>>(sql).then((r) => r.rows);
const per = await q(`
  WITH t AS (
    SELECT s.lead_id, s.status AS predicted,
           CASE WHEN t.is_spam THEN 'spam' WHEN t.dup_type IS NOT NULL THEN 'duplicate'
                WHEN t.is_invalid THEN 'invalid' ELSE 'valid' END AS actual
    FROM audit.lead_status s JOIN eval.truth t USING (lead_id))
  SELECT c AS class,
         count(*) FILTER (WHERE predicted = c AND actual = c)::int AS tp,
         count(*) FILTER (WHERE predicted = c AND actual <> c)::int AS fp,
         count(*) FILTER (WHERE predicted <> c AND actual = c)::int AS fn
  FROM t CROSS JOIN (VALUES ('duplicate'), ('spam'), ('invalid')) v(c) GROUP BY c ORDER BY c`);
const classes = per.map((r) => {
  const tp = Number(r.tp), fp = Number(r.fp), fn = Number(r.fn);
  return { ...r, precision: +(tp / (tp + fp)).toFixed(3), recall: +(tp / (tp + fn)).toFixed(3) };
});

// Where the errors come from (for the write-up).
const fpSpam = await q(`SELECT unnest(s.reasons) AS reason, count(*)::int AS n FROM audit.lead_status s JOIN eval.truth t USING (lead_id)
  WHERE s.status = 'spam' AND NOT t.is_spam GROUP BY 1 ORDER BY 2 DESC LIMIT 5`);
const fnSpam = await q(`SELECT s.status, count(*)::int AS n FROM audit.lead_status s JOIN eval.truth t USING (lead_id)
  WHERE t.is_spam AND s.status <> 'spam' GROUP BY 1`);
const dupMiss = await q(`SELECT t.dup_type, count(*)::int AS n,
  count(*) FILTER (WHERE s.status = 'duplicate')::int AS caught FROM eval.truth t JOIN audit.lead_status s USING (lead_id)
  WHERE t.dup_type IS NOT NULL GROUP BY 1 ORDER BY 1`);

// Attribution: share of non-spam leads whose channel matches the truth, raw CRM label vs corrected.
const attr = await q(`
  SELECT round(avg((x.raw_channel = t.true_channel)::int), 4)::float AS raw_accuracy,
         round(avg((x.corrected_channel = t.true_channel)::int), 4)::float AS corrected_accuracy,
         count(*)::int AS n
  FROM core.touches x JOIN eval.truth t USING (lead_id) WHERE NOT t.is_spam`);
const byRule = await q(`
  SELECT x.rule, count(*)::int AS n, round(avg((x.corrected_channel = t.true_channel)::int), 4)::float AS accuracy
  FROM core.touches x JOIN eval.truth t USING (lead_id) WHERE NOT t.is_spam GROUP BY 1 ORDER BY 2 DESC`);
const inc3 = await q(`
  SELECT count(*)::int AS n, count(*) FILTER (WHERE x.raw_channel = 'direct')::int AS raw_direct,
         count(*) FILTER (WHERE x.corrected_channel = 'google_ads')::int AS recovered
  FROM eval.truth t JOIN core.touches x USING (lead_id) WHERE t.inc_utm_redirect`);

const out = { label: "SIMULATED - scored against the simulation's hidden answer key", classes,
  spam_false_positive_reasons: fpSpam, spam_missed_by_status: fnSpam, duplicates_by_type: dupMiss,
  attribution: attr[0], attribution_by_rule: byRule, incident3_recovery: inc3[0] };
writeFileSync(resolve(ROOT, "data/derived/evaluation.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ classes, attribution: attr[0], inc3: inc3[0] }));
await db.exec("DROP SCHEMA eval CASCADE");
await db.close();
