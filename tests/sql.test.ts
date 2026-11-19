// SQL tests: run against the built database (npm run db:build && npm run audit first).
// Every test that changes data does it inside a transaction and rolls back.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { openDb, ROOT } from "../scripts/lib/db.ts";

let db: PGlite;
beforeAll(async () => { db = await openDb(); }, 60_000);
afterAll(async () => { await db?.close(); });

const sql = (f: string) => readFileSync(resolve(ROOT, f), "utf8");
const one = async <T>(q: string) => (await db.query<T>(q)).rows[0];

describe("database integrity", () => {
  it("passes every assertion in db/tests/integrity.sql", async () => {
    await expect(db.exec(sql("db/tests/integrity.sql"))).resolves.toBeDefined();
  });
});

describe("history is protected (SCD2 + snapshots)", () => {
  it("a new mapping version does not change any closed month", async () => {
    await db.exec("BEGIN");
    try {
      // Someone decides LSA should count as Google Ads FROM NOW ON: close v2, add v3.
      await db.exec(`
        UPDATE core.channel_map_scd2 SET valid_to = DATE '2026-10-31' WHERE valid_to IS NULL;
        INSERT INTO core.channel_map_scd2 (source_label, match_type, channel, priority, version, valid_from, change_note)
        VALUES ('Google Local Services', 'exact', 'google_ads', 10, 3, DATE '2026-11-01', 'test change');`);
      await db.exec(sql("db/audit/50_attribution.sql"));
      const r = await one<{ n: number }>(`SELECT count(*)::int n FROM marts.history_check WHERE snapshot <> recomputed_scd2`);
      expect(r.n).toBe(0);
    } finally { await db.exec("ROLLBACK"); }
  });

  it("the naive pipeline WOULD have rewritten closed months (the incident reproduced)", async () => {
    const r = await one<{ n: number }>(`SELECT count(*)::int n FROM marts.history_check WHERE snapshot <> recomputed_naive AND month < '2026-04-01'`);
    expect(r.n).toBeGreaterThan(0);
  });
});

describe("row level security example", () => {
  it("a brand manager only sees their brand", async () => {
    await db.exec("BEGIN");
    try {
      await db.exec(`INSERT INTO core.brand_access VALUES ('00000000-0000-0000-0000-000000000001', 'ROOF-TPA');
        SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
        SET LOCAL ROLE authenticated;`);
      const r = await db.query<{ brand: string }>(`SELECT DISTINCT brand FROM core.leads`);
      expect(r.rows.map((x) => x.brand)).toEqual(["ROOF-TPA"]);
    } finally { await db.exec("ROLLBACK"); }
  });
});

describe("idempotent webhook landing table", () => {
  it("stores a retried delivery once", async () => {
    await db.exec("BEGIN");
    try {
      for (let i = 0; i < 2; i++) {
        await db.query(`INSERT INTO raw.webhook_events (source, dedup_key, payload) VALUES ('form', 'k1', '{}'::jsonb)
                        ON CONFLICT (dedup_key) DO NOTHING`);
      }
      expect((await one<{ n: number }>(`SELECT count(*)::int n FROM raw.webhook_events WHERE dedup_key = 'k1'`)).n).toBe(1);
    } finally { await db.exec("ROLLBACK"); }
  });
});

describe("audit rules on known cases", () => {
  it("every honeypot lead is spam", async () => {
    const r = await one<{ n: number }>(`SELECT count(*)::int n FROM core.leads l JOIN audit.lead_status s USING (lead_id)
      WHERE l.honeypot IS NOT NULL AND s.status <> 'spam'`);
    expect(r.n).toBe(0);
  });
  it("one disposable domain alone is not enough to call a lead spam", async () => {
    const r = await one<{ n: number }>(`SELECT count(*)::int n FROM audit.lead_status s
      WHERE s.status = 'spam' AND NOT EXISTS (SELECT 1 FROM audit.lead_flags f
        WHERE f.lead_id = s.lead_id AND f.flag_type = 'spam' AND f.rule_id <> 'SPAM_DISPOSABLE')`);
    expect(r.n).toBe(0);
  });
  it("Google Ads reconciliation cascade adds up for every brand-month", async () => {
    const r = await one<{ n: number }>(`SELECT count(*)::int n FROM marts.recon_cascade WHERE
      platform_click_date + step_conversion_date + step_not_tracked_or_extra + step_duplicates + step_spam_invalid + step_time_zone <> crm_report`);
    expect(r.n).toBe(0);
  });
});
