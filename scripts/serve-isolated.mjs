#!/usr/bin/env node
// Serves the static export (out/) with the same cross-origin isolation headers
// as production (netlify.toml), so the multi-threaded FFmpeg core loads exactly
// as it does on the live site. Used by the Playwright tests.
//
//   node scripts/serve-isolated.mjs [port]      (default 4173)
//   ISOLATED=0 node scripts/serve-isolated.mjs  (no COOP/COEP: single-threaded)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const isolated = process.env.ISOLATED !== "0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const headers = { "X-Content-Type-Options": "nosniff" };
  if (isolated) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  }
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    const notFound = await resolveFile("/404");
    res.writeHead(404, { ...headers, "Content-Type": TYPES[".html"] });
    res.end(notFound ? await readFile(notFound) : "Not found");
    return;
  }
  res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving out/ on http://127.0.0.1:${port} (cross-origin isolated: ${isolated})`);
});
