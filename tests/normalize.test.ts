import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeEmail, extractClickIds } from "../lib/normalize.ts";

describe("normalizePhone", () => {
  it("gives one E.164 number for the five ways people type it", () => {
    const forms = ["(602) 555-0123", "602-555-0123", "+16025550123", "602.555.0123", "6025550123"];
    expect(new Set(forms.map((f) => normalizePhone(f).e164))).toEqual(new Set(["+16025550123"]));
  });
  it("marks an unassigned area code as invalid but still US", () => {
    expect(normalizePhone("(199) 555-0123")).toMatchObject({ valid: false, country: "US" });
  });
  it("detects a non-US number", () => {
    expect(normalizePhone("+61 491 570 123").country).toBe("AU");
  });
  it("handles empty and short input", () => {
    expect(normalizePhone("")).toEqual({ e164: null, country: null, valid: false });
    expect(normalizePhone("555-0142").valid).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => expect(normalizeEmail("  AbC@Example.COM ")).toBe("abc@example.com"));
  it("rejects text without @", () => expect(normalizeEmail("not-an-email")).toBeNull());
});

describe("extractClickIds", () => {
  it("reads UTM and click ids from a landing URL", () => {
    const r = extractClickIds("https://www.example.com/lp/ac-repair?utm_source=Google&utm_medium=cpc&gclid=abc");
    expect(r).toMatchObject({ utm_source: "google", utm_medium: "cpc", gclid: "abc", path: "/lp/ac-repair" });
  });
  it("returns nulls for a bad URL", () => expect(extractClickIds("::").gclid).toBeNull());
});
