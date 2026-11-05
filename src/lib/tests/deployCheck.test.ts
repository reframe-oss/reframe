// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import * as rules from "../../../scripts/deploy/lib/deployCheck.mjs";

const root = path.resolve(__dirname, "../../..");
const expected: { key: string; value: string }[] = rules.expectedHeaders(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const security = Object.fromEntries(expected.map(({ key, value }) => [key.toLowerCase(), value]));

describe("deploy check rules", () => {
  const ok = (kind: string, headers: Record<string, string>, status = 200, location?: string) =>
    rules.checkResponse({ kind, url: "u", status, headers, expected, location });

  it("passes a correct page, asset, font, worker and 404", () => {
    expect(ok("document", { ...security, "content-type": "text/html; charset=utf-8", "cache-control": "public,max-age=0,must-revalidate" }).result).toBe("pass");
    const immutable = { ...security, "cache-control": "public,max-age=31536000,immutable" };
    expect(ok("script", { ...immutable, "content-type": "application/javascript" }).result).toBe("pass");
    expect(ok("worker", { ...immutable, "content-type": "text/javascript" }).result).toBe("pass");
    expect(ok("font", { ...immutable, "content-type": "font/woff2" }).result).toBe("pass");
    expect(ok("notFound", { ...security, "content-type": "text/html" }, 404).result).toBe("pass");
  });

  it("fails each missing header, wrong MIME type or cache policy by name", () => {
    const { result, problems } = ok("script", { "content-type": "text/plain", "cache-control": "public, max-age=0" });
    expect(result).toBe("fail");
    expect(problems.join("\n")).toMatch(/Cross-Origin-Embedder-Policy: \(missing\)/);
    expect(problems.join("\n")).toMatch(/Content-Type: text\/plain/);
    expect(problems.join("\n")).toMatch(/expected immutable/);
    // HTML cached as immutable would pin users to an old build.
    expect(ok("document", { ...security, "content-type": "text/html", "cache-control": "public,max-age=31536000,immutable" }).result).toBe("fail");
  });

  it("treats auth walls as protected, not as failures", () => {
    expect(ok("document", {}, 401).result).toBe("protected");
    expect(ok("document", {}, 302, "https://vercel.com/sso/login?next=x").result).toBe("protected");
  });

  it("accepts a trailing-slash redirect only to the page itself", () => {
    expect(ok("redirect", {}, 308, "/privacy").result).toBe("pass");
    expect(ok("redirect", {}, 301, "/").result).toBe("fail");
  });

  it("requires CORS on the cross-origin WASM, not the site's own headers", () => {
    expect(ok("wasm", { "content-type": "application/wasm", "access-control-allow-origin": "*" }).result).toBe("pass");
    expect(ok("wasm", { "content-type": "application/wasm" }).result).toBe("fail");
  });

  it("ranks fail > unavailable > protected > pass", () => {
    expect(rules.overallResult(["pass", "protected", "unavailable", "fail"])).toBe("fail");
    expect(rules.overallResult(["pass", "protected", "unavailable"])).toBe("unavailable");
    expect(rules.overallResult(["pass", "protected"])).toBe("protected");
    expect(rules.overallResult(["pass"])).toBe("pass");
    expect([0, 1, 3, 4]).toEqual(["pass", "fail", "protected", "unavailable"].map(rules.exitCode));
  });

  it("detects stale, wrong and uncommitted builds", () => {
    expect(rules.commitCheck("abc1234def", "abc1234").result).toBe("pass");
    expect(rules.commitCheck("abc1234def", "fff0000").note).toMatch(/STALE OR WRONG BUILD/);
    expect(rules.commitCheck("abc1234def+dirty", "abc1234").result).toBe("fail");
    expect(rules.commitCheck(null, "abc1234").result).toBe("fail");
    expect(rules.commitCheck("abc", "ab").result).toBe("fail");
  });

  it("finds the page's resources and the worker chunk", () => {
    const html = `<link rel="preload" href="/_next/static/media/x.p.woff2" as="font"><meta name="reframe-build" content="abc1234"/><script src="/_next/static/chunks/webpack-1.js"></script>`;
    expect(rules.discoverFromHtml(html)).toMatchObject({ font: "/_next/static/media/x.p.woff2", runtime: "/_next/static/chunks/webpack-1.js", commit: "abc1234" });
    expect(rules.lazyChunksFromRuntime(`{27:"dde50262d37ca159",554:"0a02c043a2ac5e2e"}`)).toEqual([
      "/_next/static/chunks/27.dde50262d37ca159.js",
      "/_next/static/chunks/554.0a02c043a2ac5e2e.js",
    ]);
    expect(rules.wasmUrlFromWorker(`"https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd"`)).toBe(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd/ffmpeg-core.wasm"
    );
  });
});

// ── The CLI against a real local HTTP server ───────────────────────────────
type Mode = "good" | "noCoep" | "auth";
let mode: Mode = "good";
let server: http.Server;
let origin = "";

const PAGE = `<html><head><meta name="reframe-build" content="abc1234def"/><link rel="preload" href="/_next/static/media/f.woff2" as="font"><script src="/_next/static/chunks/webpack-1.js"></script></head></html>`;
const FILES: Record<string, [string, string]> = {
  "/": [PAGE, "text/html; charset=utf-8"],
  "/_next/static/chunks/webpack-1.js": [`var m={27:"0000000000000001"};`, "application/javascript"],
  "/_next/static/chunks/27.0000000000000001.js": [`fetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd")`, "application/javascript"],
  "/_next/static/media/f.woff2": ["wOF2", "font/woff2"],
  "/privacy": ["<html></html>", "text/html"],
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (mode === "auth") return void res.writeHead(401).end();
    const p = new URL(req.url!, "http://x").pathname;
    const h: Record<string, string> = { ...Object.fromEntries(expected.map(({ key, value }) => [key, value])) };
    if (mode === "noCoep") delete h["Cross-Origin-Embedder-Policy"];
    if (p === "/privacy/") return void res.writeHead(301, { Location: "/privacy" }).end();
    const file = FILES[p];
    if (!file) return void res.writeHead(404, { ...h, "Content-Type": "text/html" }).end("nf");
    h["Content-Type"] = file[1];
    h["Cache-Control"] = p.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";
    res.writeHead(200, h).end(file[0]);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function cli(...args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile("node", [path.join(root, "scripts/deploy/check-deploy.mjs"), ...args], { env: { ...process.env, VERCEL_AUTOMATION_BYPASS_SECRET: "" } }, (err, stdout) =>
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, out: stdout })
    );
  });
}

describe("check-deploy.mjs against HTTP responses", () => {
  it("passes a correctly served site and checks every resource kind", async () => {
    mode = "good";
    const { code, out } = await cli(origin, "--expect-commit", "abc1234", "--json");
    const report = JSON.parse(out);
    expect(code).toBe(0);
    expect(report.checks.map((c: { kind: string }) => c.kind)).toEqual(["document", "script", "font", "worker", "redirect", "notFound"]);
  });

  it("fails on a missing header", async () => {
    mode = "noCoep";
    const { code, out } = await cli(origin);
    expect(code).toBe(1);
    expect(out).toMatch(/Cross-Origin-Embedder-Policy: \(missing\)/);
  });

  it("fails clearly on a stale deployment", async () => {
    mode = "good";
    const { code, out } = await cli(origin, "--expect-commit", "fff0000");
    expect(code).toBe(1);
    expect(out).toMatch(/STALE OR WRONG BUILD: serves abc1234def, expected fff0000/);
  });

  it("reports a protected deployment separately", async () => {
    mode = "auth";
    const { code, out } = await cli(origin);
    expect(code).toBe(3);
    expect(out).toMatch(/requires authentication/);
  });

  it("reports an unreachable deployment separately", async () => {
    const { code, out } = await cli("http://127.0.0.1:9/");
    expect(code).toBe(4);
    expect(out).toMatch(/could not be reached/);
  });

  it("rejects bad usage", async () => {
    expect((await cli("not-a-url")).code).toBe(2);
    expect((await cli(origin, "--expect-commit")).code).toBe(2);
  });
});
