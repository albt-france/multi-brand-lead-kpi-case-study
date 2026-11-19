// Tests of the webhook intake against fixtures, and of the idempotent landing table in a real PostgreSQL (PGlite, in memory).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { processWebhook, validate, type FormWebhook } from "./intake.ts";

const DISPOSABLE = new Set(["mailinator.com", "10minutemail.com"]);
const base = (): FormWebhook => ({
  type: "form_submission", location_id: "HVAC-PHX", form_id: "quote_form", submitted_at: "2026-10-30T23:40:00Z",
  contact: { phone: "(602) 555-0123", email: "U7K2X9@Example.com" },
  fields: { message: "AC not cooling", website: null },
  page: { url: "https://www.hvac-phx.example/lp/ac-repair?utm_source=google&utm_medium=cpc&utm_campaign=search-ac-repair&gclid=Cj0KCQjwTEST", referrer: "https://www.google.com/" },
  event_id: "evt_0001",
});

describe("validate", () => {
  it("accepts a valid payload", () => expect(validate(base())).toEqual([]));
  it("rejects missing contact and bad brand", () => {
    const p = { ...base(), location_id: "ACME", contact: {} };
    expect(validate(p)).toEqual(["unknown location_id", "contact needs a phone or an e-mail"]);
  });
  it("rejects non-objects", () => expect(validate("hello")).toEqual(["payload is not a JSON object"]));
});

describe("processWebhook", () => {
  it("normalizes phone and e-mail, extracts UTM and GCLID", async () => {
    const r = await processWebhook(base(), DISPOSABLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ phone_e164: "+16025550123", email: "u7k2x9@example.com", utm_source: "google", utm_medium: "cpc", gclid: "Cj0KCQjwTEST", landing_path: "/lp/ac-repair" });
    expect(r.flags).toEqual([]);
  });
  it("flags a paid landing page that arrived without UTM (incident #03 signature)", async () => {
    const r = await processWebhook({ ...base(), page: { url: "https://www.hvac-phx.example/lp/ac-repair", referrer: null } }, DISPOSABLE);
    expect(r.ok && r.row.gclid).toBeNull();
    expect(r.ok && r.flags).toContain("paid landing page without UTM");
  });
  it("flags spam signals with readable reasons", async () => {
    const r = await processWebhook({ ...base(), contact: { phone: "+44 7700 900123", email: "x@mailinator.com" }, fields: { website: "http://spam.example.org" } }, DISPOSABLE);
    expect(r.ok && r.flags).toContain("honeypot filled");
    expect(r.ok && r.flags).toContain("disposable domain (mailinator.com)");
  });
  it("gives the same key to a retried delivery, with or without event_id", async () => {
    const a = await processWebhook(base(), DISPOSABLE), b = await processWebhook(base(), DISPOSABLE);
    expect(a.ok && b.ok && a.dedupKey === b.dedupKey).toBe(true);
    const n1 = await processWebhook({ ...base(), event_id: null }, DISPOSABLE), n2 = await processWebhook({ ...base(), event_id: null }, DISPOSABLE);
    expect(n1.ok && n2.ok && n1.dedupKey === n2.dedupKey && n1.dedupKey.startsWith("sha:")).toBe(true);
  });
});

describe("idempotent storage (raw.webhook_events)", () => {
  it("stores a delivery received twice only once", async () => {
    const db = new PGlite();
    await db.exec("CREATE SCHEMA raw;" + readFileSync(resolve(import.meta.dirname, "../../db/migrations/002_raw.sql"), "utf8"));
    const r = await processWebhook(base(), DISPOSABLE);
    if (!r.ok) throw new Error("fixture invalid");
    for (let i = 0; i < 2; i++) {
      await db.query(`INSERT INTO raw.webhook_events (source, dedup_key, payload) VALUES ('form', $1, $2) ON CONFLICT (dedup_key) DO NOTHING`, [r.dedupKey, JSON.stringify(r.row)]);
    }
    const n = await db.query<{ n: number; gclid: string }>(`SELECT count(*)::int n, max(payload->>'gclid') gclid FROM raw.webhook_events`);
    expect(n.rows[0]).toEqual({ n: 1, gclid: "Cj0KCQjwTEST" });
    await db.close();
  });
});
