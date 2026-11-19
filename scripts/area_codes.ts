// Writes pipeline/us_area_codes_valid.json: US area codes libphonenumber considers in service.
// The simulation draws fictional 555-01XX numbers only from these, so "valid" leads really validate.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { ROOT } from "./lib/db.ts";

const ok: number[] = [];
for (let a = 200; a < 1000; a++) {
  const p = parsePhoneNumberFromString(`(${a}) 555-0123`, "US");
  if (p?.isValid() && p.country === "US") ok.push(a);
}
writeFileSync(resolve(ROOT, "pipeline/us_area_codes_valid.json"), JSON.stringify(ok));
console.log(`${ok.length} area codes`);
