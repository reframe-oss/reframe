// Minimal static server for `out/` that sends the headers declared in
// vercel.json (read at startup, so local runs test the deployed config).
// NOISO=1 drops COOP/COEP to exercise the single-threaded fallback.
// Usage: [NOISO=1] node serve.mjs <dir> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 4300);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png", ".wasm": "application/wasm",
};

const vercelJson = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vercel.json");
const rule = JSON.parse(fs.readFileSync(vercelJson, "utf8")).headers.find((h) => h.source === "/(.*)");
const headers = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
if (process.env.NOISO) {
  delete headers["Cross-Origin-Opener-Policy"];
  delete headers["Cross-Origin-Embedder-Policy"];
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  if (!fs.existsSync(file)) { res.writeHead(404, headers).end("not found"); return; }
  const ext = path.extname(file);
  const body = fs.readFileSync(file);
  const h = { ...headers, "Content-Type": types[ext] ?? "application/octet-stream" };
  if (p.startsWith("/_next/static/")) h["Cache-Control"] = "public, max-age=31536000, immutable";
  // Vercel serves brotli; mirror that so transfer sizes are comparable.
  if (/\.(js|css|html|svg|json|txt)$/.test(ext) && /br/.test(req.headers["accept-encoding"] ?? "")) {
    h["Content-Encoding"] = "br";
    res.writeHead(200, h).end(zlib.brotliCompressSync(body));
    return;
  }
  res.writeHead(200, h).end(body);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}${process.env.NOISO ? " (no COOP/COEP)" : ""}`));
