// Shared normalization helpers, used by the database build, the webhook intake and the tests.
// Kept small and pure (no I/O) so each function can be unit-tested on its own.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type PhoneInfo = { e164: string | null; country: string | null; valid: boolean };

/** "(602) 555-0123", "602.555.0123", "+16025550123" -> one E.164 number (+16025550123). */
export function normalizePhone(raw: string | null | undefined): PhoneInfo {
  if (!raw || !raw.trim()) return { e164: null, country: null, valid: false };
  const p = parsePhoneNumberFromString(raw, "US"); // numbers without +country are read as US numbers
  if (!p) return { e164: null, country: null, valid: false };
  // +1 numbers with an unassigned area code have no country: keep them as US so they are "invalid", not "foreign".
  const country = p.country ?? (p.countryCallingCode === "1" ? "US" : `+${p.countryCallingCode}`);
  return { e164: p.number, country, valid: p.isValid() };
}

/** Trim + lower-case. Returns null when there is no "@". */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export type ClickIds = {
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  gclid: string | null; fbclid: string | null; path: string | null;
};

/** Reads UTM parameters and click ids from a landing-page URL. */
export function extractClickIds(url: string | null | undefined): ClickIds {
  const empty: ClickIds = { utm_source: null, utm_medium: null, utm_campaign: null, gclid: null, fbclid: null, path: null };
  if (!url) return empty;
  let u: URL;
  try { u = new URL(url); } catch { return empty; }
  const q = (k: string) => u.searchParams.get(k) || null;
  return {
    utm_source: q("utm_source")?.toLowerCase() ?? null, utm_medium: q("utm_medium")?.toLowerCase() ?? null,
    utm_campaign: q("utm_campaign"), gclid: q("gclid"), fbclid: q("fbclid"), path: u.pathname,
  };
}
