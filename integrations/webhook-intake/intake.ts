// Webhook intake logic (pure, no I/O): validate -> normalize -> extract UTM / click ids -> idempotency key -> quick spam flags.
// Used by the Supabase Edge Function (index.ts) and by the Vitest tests. Runs against fixtures; ready for real credentials.
import { normalizePhone, normalizeEmail, extractClickIds } from "../../lib/normalize.ts";

export type FormWebhook = {
  type: string;
  location_id: string;                 // brand code in the CRM
  form_id?: string;
  submitted_at: string;                // ISO 8601, UTC
  contact: { phone?: string | null; email?: string | null };
  fields?: { message?: string | null; website?: string | null };   // "website" is the hidden honeypot field
  page?: { url?: string | null; referrer?: string | null };
  event_id?: string | null;            // shared with GA4 / Meta CAPI when the tracking snippet is installed
};

export type IntakeResult =
  | { ok: false; status: 400; errors: string[] }
  | {
      ok: true; status: 200; dedupKey: string;
      row: {
        brand: string; submitted_at: string; form_id: string | null;
        phone_e164: string | null; phone_country: string | null; phone_valid: boolean; email: string | null;
        utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; gclid: string | null; fbclid: string | null;
        landing_path: string | null; referrer: string | null; event_id: string | null;
      };
      flags: string[];                 // readable reasons, e.g. "honeypot filled"
    };

const BRANDS = new Set(["HVAC-PHX", "PLMB-DAL", "ROOF-TPA", "ELEC-ATL", "PEST-BNA"]);

/** Checks the payload shape. Returns a list of readable errors (empty = valid). */
export function validate(p: unknown): string[] {
  const e: string[] = [];
  const o = p as Partial<FormWebhook> | null;
  if (!o || typeof o !== "object") return ["payload is not a JSON object"];
  if (o.type !== "form_submission") e.push("type must be 'form_submission'");
  if (!o.location_id || !BRANDS.has(o.location_id)) e.push("unknown location_id");
  if (!o.submitted_at || Number.isNaN(Date.parse(o.submitted_at))) e.push("submitted_at is not a date");
  if (!o.contact || (!o.contact.phone && !o.contact.email)) e.push("contact needs a phone or an e-mail");
  return e;
}

/** SHA-256 hex (Web Crypto: same API in Deno, Node 20 and browsers). */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Idempotency key: the same submission delivered twice (webhook retries) gets the same key.
 * With an event_id we trust it; without one we hash the fields that identify the submission.
 */
export async function dedupKey(p: FormWebhook, phone: string | null, email: string | null): Promise<string> {
  if (p.event_id) return `evt:${p.location_id}:${p.event_id}`;
  return "sha:" + (await sha256([p.location_id, p.form_id ?? "", p.submitted_at, phone ?? "", email ?? ""].join("|")));
}

export async function processWebhook(payload: unknown, disposableDomains: Set<string>): Promise<IntakeResult> {
  const errors = validate(payload);
  if (errors.length) return { ok: false, status: 400, errors };
  const p = payload as FormWebhook;
  const phone = normalizePhone(p.contact.phone);
  const email = normalizeEmail(p.contact.email);
  const click = extractClickIds(p.page?.url);
  const flags: string[] = [];
  if (p.fields?.website) flags.push("honeypot filled");
  const domain = email?.split("@")[1];
  if (domain && disposableDomains.has(domain)) flags.push(`disposable domain (${domain})`);
  if (phone.country && phone.country !== "US") flags.push(`non-US phone (${phone.country})`);
  if (p.contact.phone && !phone.valid) flags.push("phone cannot exist");
  if (click.path?.startsWith("/lp/") && !click.utm_source) flags.push("paid landing page without UTM");
  return {
    ok: true, status: 200, dedupKey: await dedupKey(p, phone.e164, email), flags,
    row: {
      brand: p.location_id, submitted_at: new Date(p.submitted_at).toISOString(), form_id: p.form_id ?? null,
      phone_e164: phone.e164, phone_country: phone.country, phone_valid: phone.valid, email,
      utm_source: click.utm_source, utm_medium: click.utm_medium, utm_campaign: click.utm_campaign,
      gclid: click.gclid, fbclid: click.fbclid, landing_path: click.path, referrer: p.page?.referrer ?? null,
      event_id: p.event_id ?? null,
    },
  };
}
