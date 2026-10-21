// Minimal static server for `out/` that mirrors the headers in vercel.json
// (COOP/COEP etc.), so local runs see the cross-origin-isolated mode that
// vercel.json intends. NOISO=1 drops the headers (what production currently
// serves — see docs/PERFORMANCE.md). Usage: [NOISO=1] node serve.mjs <dir> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 4300);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".png": "image/png", ".wasm": "application/wasm",
};
const headers = process.env.NOISO ? { "X-Content-Type-Options": "nosniff" } : {
  "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
};

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
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
