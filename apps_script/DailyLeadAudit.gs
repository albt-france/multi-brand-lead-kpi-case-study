/**
 * DailyLeadAudit.gs: Google Apps Script for a "Leads" Google Sheet. NOT run in a live Sheet in this case study:
 * the logic it calls (AuditLogic.js) is tested with Vitest on fixtures (apps_script/audit.test.ts).
 *
 * Install: Extensions > Apps Script, add AuditLogic.js and this file, run installDailyTrigger() once.
 * Every morning it colours duplicates, paid leads without UTM and non-standard source labels, adds a note
 * with the reason on each cell, and rewrites an "Audit summary" tab. It never edits or deletes a value.
 */

var SHEET_NAME = "Leads";
var COLOURS = { duplicate: "#E3E6FB", missing_utm: "#FFE7DC", label: "#FBF0D3" };

function dailyLeadAudit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found");
  var range = sheet.getDataRange();
  var values = range.getValues();
  var result = auditRows(values);                         // pure logic from AuditLogic.js

  // Reset previous colours and notes on the data area, then mark today's issues.
  var body = sheet.getRange(2, 1, Math.max(1, values.length - 1), values[0].length);
  body.setBackground(null).clearNote();
  result.issues.forEach(function (it) {
    sheet.getRange(it.row, it.col).setBackground(COLOURS[it.type]).setNote(it.message);
  });

  // Summary tab: one line per brand + run timestamp.
  var out = ss.getSheetByName("Audit summary") || ss.insertSheet("Audit summary");
  out.clear();
  var rows = [["Brand", "Rows", "Duplicates", "Paid without UTM", "Non-standard labels"]];
  Object.keys(result.summary).sort().forEach(function (b) {
    var s = result.summary[b];
    rows.push([b, s.rows, s.duplicates, s.missingUtm, s.labels]);
  });
  out.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  out.getRange(1, 1, 1, rows[0].length).setFontWeight("bold");
  out.getRange(rows.length + 2, 1).setValue("Last run: " + new Date().toISOString());
}

/** Creates the daily 7am trigger (run once by hand). */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dailyLeadAudit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyLeadAudit").timeBased().everyDays(1).atHour(7).create();
}
