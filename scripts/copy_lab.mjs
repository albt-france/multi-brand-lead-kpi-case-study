// Copies the tracking lab (integrations/tracking-lab) into the static site (web/public/lab) before each build,
// so the demo page and the tested code are the same file.
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "web/public/lab");
mkdirSync(out, { recursive: true });
for (const f of ["index.html", "capture.js"]) copyFileSync(resolve(root, "integrations/tracking-lab", f), resolve(out, f));
copyFileSync(resolve(root, "web/app/icon.svg"), resolve(root, "web/public/icon.svg"));
console.log("lab copied to web/public/lab");
