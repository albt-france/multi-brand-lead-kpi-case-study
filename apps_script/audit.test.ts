// Tests the Apps Script audit logic (AuditLogic.js) on a fixture sheet, outside Google.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { auditRows, standardSource, normalizePhoneDigits } = require("./AuditLogic.js");

const SHEET = [
  ["date", "brand", "phone", "email", "source", "utm_source", "utm_medium", "gclid"],
  ["2026-10-01", "HVAC-PHX", "(602) 555-0123", "a1@example.com", "Google Ads", "google", "cpc", "Cj0A"],
  ["2026-10-02", "HVAC-PHX", "+1 602.555.0123", "", "google ads", "google", "cpc", ""],   // dup phone + label
  ["2026-10-02", "PLMB-DAL", "(214) 555-0150", "b2@example.com", "Google-Ads", "", "", ""],    // label + missing UTM
  ["2026-10-03", "PLMB-DAL", "(214) 555-0151", "B2@example.com", "Organic", "", "", ""],       // dup e-mail
  ["2026-12-15", "HVAC-PHX", "(602) 555-0123", "", "GBP Call", "", "", ""],                   // same phone, > 30 days: not a dup
  ["2026-10-04", "ROOF-TPA", "(813) 555-0170", "", "billboard", "", "", ""],                  // unknown label
];

describe("Apps Script audit logic", () => {
  it("normalizes phone formats", () => {
    expect(normalizePhoneDigits("(602) 555-0123")).toBe("6025550123");
    expect(normalizePhoneDigits("+1 602.555.0123")).toBe("6025550123");
    expect(normalizePhoneDigits("555-0123")).toBeNull();
  });
  it("maps typed labels to the standard list", () => {
    expect(standardSource("Google-Ads")).toBe("Google Ads");
    expect(standardSource(" gbp ")).toBe("GBP Call");
    expect(standardSource("billboard")).toBeNull();
  });
  it("finds duplicates, missing UTM and labels with sheet coordinates", () => {
    const { issues, summary } = auditRows(SHEET);
    const by = (t: string) => issues.filter((i: { type: string }) => i.type === t).map((i: { row: number }) => i.row);
    expect(by("duplicate")).toEqual([3, 5]);
    expect(by("label")).toEqual([3, 4, 7]);
    expect(by("missing_utm")).toEqual([4]);
    expect(issues.find((i: { row: number; type: string }) => i.row === 3 && i.type === "duplicate").message).toBe("Same phone as row 2");
    expect(summary["PLMB-DAL"]).toEqual({ rows: 2, duplicates: 1, missingUtm: 1, labels: 1 });
  });
});
