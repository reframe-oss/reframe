import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guards the hosting config. Production once shipped with none of
// vercel.json's headers because a legacy `routes: [{ handle: "filesystem" }]`
// block made Vercel compile the header rule *after* the filesystem phase, so
// it never applied to static files (verified with `vercel build`, see
// docs/PERFORMANCE.md). No COOP/COEP meant no multi-threaded FFmpeg.

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const vercel = JSON.parse(read("vercel.json")) as {
  routes?: unknown;
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const catchAll = vercel.headers.find((h) => h.source === "/(.*)");
const vercelHeaders = Object.fromEntries((catchAll?.headers ?? []).map((h) => [h.key, h.value]));

const REQUIRED = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** "Key: value" / Key = "value" pairs from netlify.toml or public/_headers. */
function parseHeaderFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z-]+)\s*(?::|=)\s*"?([^"#]+?)"?\s*$/);
    if (m && /-/.test(m[1]!)) out[m[1]!] = m[2]!;
  }
  return out;
}

describe("vercel.json", () => {
  it("has no legacy `routes` block (it stops `headers` reaching static files)", () => {
    expect(vercel.routes).toBeUndefined();
  });

  it("sends the cross-origin isolation and security headers on every path", () => {
    expect(catchAll).toBeDefined();
    expect(vercelHeaders).toMatchObject(REQUIRED);
  });

  it("leaves HSTS to Vercel's stronger default (2 years, preload) instead of overriding it", () => {
    expect(vercelHeaders["Strict-Transport-Security"]).toBeUndefined();
  });

  it("does not add a CSP that could block the FFmpeg CDN or the RUM intake", () => {
    expect(vercelHeaders["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("other hosts stay in sync", () => {
  it.each(["netlify.toml", "public/_headers"])("%s sends the same isolation and security headers", (file) => {
    expect(parseHeaderFile(read(file))).toMatchObject(REQUIRED);
  });
});

describe("cross-origin isolation compatibility", () => {
  it("the worker fetches the FFmpeg cores with CORS from a CDN that allows it", () => {
    const worker = read("src/lib/ffmpeg.worker.ts");
    // Under COEP require-corp, cross-origin loads need CORS (or CORP).
    // fetch() defaults to mode "cors"; jsdelivr answers with
    // Access-Control-Allow-Origin: *. The cores are then used as blob: URLs,
    // which are same-origin.
    expect(worker).toContain("https://cdn.jsdelivr.net/npm/@ffmpeg/core@");
    expect(worker).toContain("https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@");
    expect(worker).not.toMatch(/mode:\s*["']no-cors["']/);
  });

  it("the app shell loads no third-party scripts, styles or fonts", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toMatch(/<script[^>]+src=["']https?:/);
    expect(layout).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]+https?:/);
    expect(read("src/app/globals.css")).not.toMatch(/@import\s+url\(["']?https?:/);
  });
});
