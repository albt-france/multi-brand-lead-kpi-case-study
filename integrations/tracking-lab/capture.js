// Tracking capture for lead forms (plain browser JavaScript, no dependency).
// 1. On landing, read UTM / gclid / fbclid from the URL and keep them 90 days (first-party storage).
// 2. On the form, copy them into hidden fields so they reach the CRM even after a redirect or a later visit.
// 3. On submit, create one event_id, push `generate_lead` to the GTM dataLayer with it, and reuse the SAME
//    event_id for the Meta Conversions API call made server-side, so Meta can deduplicate Pixel + CAPI.
// 4. Count the conversion once per submission, even if the thank-you page is reloaded (incident #10).
// Demo only: runs on the /lab page with fictional data; no tag is sent anywhere.

export const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
export const TTL_DAYS = 90;
const STORE = "lk_attribution";

/** Reads attribution parameters from a URL. Returns null when the URL carries none. */
export function readAttribution(url, now = Date.now()) {
  const u = new URL(url);
  const out = {};
  for (const k of KEYS) { const v = u.searchParams.get(k); if (v) out[k] = v; }
  if (!Object.keys(out).length) return null;
  return { ...out, landing_page: u.pathname, captured_at: new Date(now).toISOString() };
}

/**
 * Saves attribution. The first touch is kept; a new ad click (new gclid / fbclid / UTM) becomes the last touch.
 * Both expire after TTL_DAYS.
 */
export function saveAttribution(storage, attr, now = Date.now()) {
  if (!attr) return loadAttribution(storage, now);
  const cur = loadAttribution(storage, now);
  const rec = { first: cur?.first ?? attr, last: attr, expires: now + TTL_DAYS * 864e5 };
  storage.setItem(STORE, JSON.stringify(rec));
  return rec;
}

/** Returns the stored attribution, or null when missing or expired (expired data is removed). */
export function loadAttribution(storage, now = Date.now()) {
  try {
    const rec = JSON.parse(storage.getItem(STORE) || "null");
    if (!rec || rec.expires < now) { storage.removeItem(STORE); return null; }
    return rec;
  } catch { return null; }
}

/** Fills hidden inputs named like the keys (last touch) and first_* (first touch). Missing inputs are created. */
export function fillHiddenFields(form, rec) {
  if (!rec) return 0;
  let n = 0;
  const put = (name, value) => {
    if (!value) return;
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) { el = form.ownerDocument.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
    el.value = value; n++;
  };
  for (const k of [...KEYS, "landing_page"]) put(k, rec.last?.[k]);
  put("first_utm_source", rec.first?.utm_source);
  put("first_landing_page", rec.first?.landing_page);
  return n;
}

/** A random id shared by the browser event and the server-side event. */
export function newEventId(cryptoObj = globalThis.crypto) {
  return "evt_" + cryptoObj.randomUUID().replace(/-/g, "").slice(0, 20);
}

/**
 * Pushes generate_lead once per submission id. Returns true when pushed, false when already counted
 * (e.g. the thank-you page was reloaded). The flag lives in sessionStorage.
 */
export function trackLeadOnce(dataLayer, session, submissionId, eventId, extra = {}) {
  const key = `lk_counted_${submissionId}`;
  if (session.getItem(key)) return false;
  dataLayer.push({ event: "generate_lead", event_id: eventId, submission_id: submissionId, ...extra });
  session.setItem(key, "1");
  return true;
}

/** What the server would send to the Meta Conversions API for the same lead (shape only; hashing done server-side). */
export function capiPayload(eventId, pageUrl, nowSec = Math.floor(Date.now() / 1000)) {
  return {
    data: [{
      event_name: "Lead", event_time: nowSec, event_id: eventId, action_source: "website", event_source_url: pageUrl,
      user_data: { em: ["<sha256 of the normalized e-mail>"], ph: ["<sha256 of the E.164 phone>"] },
    }],
  };
}
