// npm run screens  (after `npm run build`)
// Serves web/out locally and captures each page with headless Microsoft Edge:
// light + dark, desktop 1440 px and mobile 390 px. Output: docs/screens/*.png
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const run = promisify(execFile);   // async, so the local server keeps answering while Edge loads the page
import { ROOT } from "./lib/db.ts";

const OUT = resolve(ROOT, "web/out");
const SHOTS = resolve(ROOT, "docs/screens");
mkdirSync(SHOTS, { recursive: true });
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) throw new Error("Microsoft Edge not found");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain" };

const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  let f = join(OUT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const PORT = (server.address() as { port: number }).port;

const pages = (process.argv[2] || "home:/,overview:/dashboard/,audit:/dashboard/audit/,attribution:/dashboard/attribution/,reconciliation:/dashboard/reconciliation/").split(",");
const modes = (process.argv[3] || "light-desktop,dark-desktop,light-mobile,dark-mobile").split(",");
for (const p of pages) {
  const [name, path] = p.split(":");
  for (const m of modes) {
    const [theme, dev] = m.split("-");
    const size = dev === "mobile" ? "390,2600" : name === "home" ? "1440,900" : name === "report" ? "1123,6400" : "1440,2400";
    const file = resolve(SHOTS, `${name}-${theme}-${dev}.png`);
    await run(EDGE!, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${join(tmpdir(), "lk-edge")}`,
      `--window-size=${size}`, "--virtual-time-budget=9000", `--screenshot=${file}`, `http://localhost:${PORT}${path}?theme=${theme}`], { timeout: 90_000 });
    console.log("  ", file.replace(ROOT, "."));
  }
}
server.close();
