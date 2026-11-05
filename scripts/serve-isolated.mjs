#!/usr/bin/env node
// Serves the static export (out/) with the same headers as production: the
// security and cross-origin isolation headers declared for every host
// (vercel.json, kept identical to netlify.toml and public/_headers by
// deployConfig.test.ts), immutable caching for hashed assets and the hosts'
// trailing-slash redirect. So the multi-threaded FFmpeg core loads exactly as
// on the live site, and scripts/deploy/check-deploy.mjs can check a local
// build. Used by the Playwright tests and deploy-smoke.yml.
//
//   node scripts/serve-isolated.mjs [port]      (default 4173)
//   ISOLATED=0 node scripts/serve-isolated.mjs  (no COOP/COEP: single-threaded)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const vercelJson = resolve(dirname(fileURLToPath(import.meta.url)), "../vercel.json");
const declared = JSON.parse(readFileSync(vercelJson, "utf8")).headers.find((rule) => rule.source === "/(.*)").headers;

createServer(async (req, res) => {
  const headers = Object.fromEntries(declared.map(({ key, value }) => [key, value]));
  if (!isolated) {
    delete headers["Cross-Origin-Opener-Policy"];
    delete headers["Cross-Origin-Embedder-Policy"];
  }
  const path = (req.url ?? "/").split("?")[0];
  // Netlify and Vercel both drop a trailing slash on pages.
  if (path.length > 1 && path.endsWith("/")) {
    res.writeHead(301, { Location: path.slice(0, -1) });
    res.end();
    return;
  }
  headers["Cache-Control"] = path.startsWith("/_next/static/")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
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
