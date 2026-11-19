/**
 * Daily lead-sheet audit: pure logic (no SpreadsheetApp call), shared by Apps Script and the Vitest tests.
 * In Apps Script this file is a normal script file (global functions); in Node it is loaded with require().
 *
 * Input: rows of a leads sheet, header first:
 *   date | brand | phone | email | source | utm_source | utm_medium | gclid
 * Output: one issue per cell to colour, and a summary per brand.
 */

var STANDARD_SOURCES = ["Google Ads", "LSA", "Meta", "GBP Call", "Organic", "Direct", "Referral"];
var PAID_SOURCES = ["Google Ads", "Meta"];
// Typed variants seen in the call sheet -> standard label (incident #09)
var SOURCE_ALIASES = {
  "google ads": "Google Ads", "adwords": "Google Ads", "lsa": "LSA", "local services": "LSA",
  "meta": "Meta", "facebook": "Meta", "fb": "Meta", "facebook ads": "Meta",
  "gbp call": "GBP Call", "gbp": "GBP Call", "google maps": "GBP Call",
  "organic": "Organic", "seo": "Organic", "google search": "Organic",
  "direct": "Direct", "drive by": "Direct", "referral": "Referral", "referal": "Referral", "neighbor referral": "Referral"
};
var DUP_WINDOW_DAYS = 30;

/** Digits only, last 10 for US numbers: "(602) 555-0123" and "+1 602.555.0123" give "6025550123". */
function normalizePhoneDigits(raw) {
  var d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
  return d.length === 10 ? d : null;
}

/** Suggests the standard label for a typed source, or null when it cannot be mapped. */
function standardSource(raw) {
  var s = String(raw || "").trim();
  if (STANDARD_SOURCES.indexOf(s) >= 0) return s;
  var k = s.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  return SOURCE_ALIASES[k] || null;
}

/**
 * Audits the rows. Returns { issues: [{row, col, type, message}], summary: {brand: {rows, duplicates, missingUtm, labels}} }.
 * row/col are 1-based sheet coordinates (row 1 = header).
 */
function auditRows(values) {
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var c = function (name) { return head.indexOf(name); };
  var issues = [], summary = {}, seen = {};
  for (var i = 1; i < values.length; i++) {
    var r = values[i], brand = String(r[c("brand")] || "").trim();
    if (!brand) continue;
    var s = summary[brand] || (summary[brand] = { rows: 0, duplicates: 0, missingUtm: 0, labels: 0 });
    s.rows++;
    var when = new Date(r[c("date")]).getTime();
    var keys = [];
    var ph = normalizePhoneDigits(r[c("phone")]);
    if (ph) keys.push(brand + "|p|" + ph);
    var em = String(r[c("email")] || "").trim().toLowerCase();
    if (em.indexOf("@") > 0) keys.push(brand + "|e|" + em);
    for (var k = 0; k < keys.length; k++) {
      var prev = seen[keys[k]];
      if (prev && when - prev.when <= DUP_WINDOW_DAYS * 864e5) {
        issues.push({ row: i + 1, col: c(keys[k].indexOf("|p|") > 0 ? "phone" : "email") + 1, type: "duplicate", message: "Same " + (keys[k].indexOf("|p|") > 0 ? "phone" : "e-mail") + " as row " + prev.row });
        s.duplicates++;
        break;
      }
    }
    keys.forEach(function (key) { if (!seen[key]) seen[key] = { row: i + 1, when: when }; });
    var std = standardSource(r[c("source")]);
    if (String(r[c("source")]).trim() !== std) {
      issues.push({ row: i + 1, col: c("source") + 1, type: "label", message: std ? "Use \"" + std + "\"" : "Unknown source label" });
      s.labels++;
    }
    if (PAID_SOURCES.indexOf(std) >= 0 && !String(r[c("utm_source")] || "").trim()) {
      issues.push({ row: i + 1, col: c("utm_source") + 1, type: "missing_utm", message: "Paid lead without UTM" });
      s.missingUtm++;
    }
  }
  return { issues: issues, summary: summary };
}

if (typeof module !== "undefined") module.exports = { auditRows: auditRows, standardSource: standardSource, normalizePhoneDigits: normalizePhoneDigits };
