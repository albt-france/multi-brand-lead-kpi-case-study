// npm run pdf
// 1. builds the site with the methods note taken from the README (it belongs to the README and the PDF only),
// 2. prints /report/ with headless Microsoft Edge to report/lead-kpi-case-study.pdf,
// 3. removes the PDF metadata (pipeline/clean_pdf.py), 4. rebuilds the normal site.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { ROOT } from "./lib/db.ts";

const run = promisify(execFile);
const OUT = resolve(ROOT, "web/out");
const PDF = resolve(ROOT, "report/lead-kpi-case-study.pdf");
mkdirSync(resolve(ROOT, "report"), { recursive: true });
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) throw new Error("Microsoft Edge not found");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };

const NOTE = readFileSync(resolve(ROOT, "README.md"), "utf8").split(String.fromCharCode(10)).map((l) => l.trim()).find((l) => l.startsWith("AI-assisted workflow:")) ?? "";
const nextBuild = (report: boolean) => run(process.execPath, [resolve(ROOT, "node_modules/next/dist/bin/next"), "build", "web"],
  { cwd: ROOT, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_METHODS_NOTE: report ? NOTE : "" }, maxBuffer: 1 << 26 });
await nextBuild(true);

const server = createServer((req, res) => {
  let f = join(OUT, decodeURIComponent((req.url || "/").split("?")[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const port = (server.address() as { port: number }).port;

await run(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${join(tmpdir(), "lk-edge-pdf")}`,
  "--no-pdf-header-footer", "--print-to-pdf-no-header", "--virtual-time-budget=15000", "--run-all-compositor-stages-before-draw",
  `--print-to-pdf=${PDF}`, `http://localhost:${port}/report/?theme=light`], { timeout: 120_000 });
server.close();
const py = process.platform === "win32" ? "python" : "python3";
const clean = await run(existsSync(resolve(ROOT, ".venv/Scripts/python.exe")) ? resolve(ROOT, ".venv/Scripts/python.exe") : py, [resolve(ROOT, "pipeline/clean_pdf.py"), PDF]);
console.log(clean.stdout.trim());
await nextBuild(false);
console.log(`PDF written: report/lead-kpi-case-study.pdf (${(statSync(PDF).size / 1024).toFixed(0)} KB)`);
