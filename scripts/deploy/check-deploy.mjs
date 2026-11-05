// Checks a deployed (or locally served) Reframe site with real HTTP requests:
// security and cross-origin-isolation headers, MIME types and caching on the
// HTML page, a hashed JS chunk, the preloaded font, the FFmpeg worker chunk
// and a 404; the trailing-slash redirect; CORS on the jsDelivr WASM the
// worker loads; and, with --expect-commit, that the build is the right one.
// Rules live in lib/deployCheck.mjs.
//
// Usage: node scripts/deploy/check-deploy.mjs <url> [--expect-commit <sha>] [--json]
// Exit codes:
//   0 pass · 1 fail (including a stale/wrong commit) · 2 usage error
//   3 protected: the deployment requires authentication, nothing was checked
//   4 unavailable: the site couldn't be reached (DNS, network, 5xx on the page)
// For an SSO-protected Vercel preview, set VERCEL_AUTOMATION_BYPASS_SECRET
// (Project → Settings → Deployment Protection → Protection Bypass for
// Automation). It is sent as a header and never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESULT,
  checkResponse,
  commitCheck,
  discoverFromHtml,
  exitCode,
  expectedHeaders,
  isWorkerChunk,
  lazyChunksFromRuntime,
  overallResult,
  wasmUrlFromWorker,
} from "./lib/deployCheck.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const commitIdx = args.indexOf("--expect-commit");
const expectCommit = commitIdx >= 0 ? args[commitIdx + 1] : null;
const target = args.find((a, i) => !a.startsWith("--") && (commitIdx < 0 || i !== commitIdx + 1));

let base;
try {
  base = new URL(target);
} catch {
  base = null;
}
if (!base || !/^https?:$/.test(base.protocol) || (commitIdx >= 0 && !expectCommit)) {
  console.error("usage: node scripts/deploy/check-deploy.mjs <http(s) url> [--expect-commit <sha>] [--json]");
  process.exit(2);
}

const vercelJson = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vercel.json");
const expected = expectedHeaders(fs.readFileSync(vercelJson, "utf8"));

const requestHeaders = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  requestHeaders["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const checks = [];
const log = (line) => {
  if (!json) console.log(line);
};

async function request(url, method = "GET") {
  try {
    const res = await fetch(url, { method, headers: requestHeaders, redirect: "manual" });
    return { res, body: method === "GET" ? await res.text() : "" };
  } catch (err) {
    return { error: err instanceof Error ? err.cause?.code ?? err.message : String(err) };
  }
}

async function check(kind, url, method) {
  const { res, body, error } = await request(url, method);
  const outcome = error
    ? { kind, url, status: null, result: RESULT.UNAVAILABLE, problems: [], notes: [`unreachable: ${error}`] }
    : checkResponse({ kind, url, status: res.status, headers: res.headers, expected, location: res.headers.get("location") });
  checks.push(outcome);
  const mark = { pass: "ok  ", fail: "FAIL", protected: "AUTH", unavailable: "DOWN" }[outcome.result];
  log(`${mark} ${kind.padEnd(9)} ${outcome.status ?? "---"} ${url}`);
  for (const p of outcome.problems) log(`       ✗ ${p}`);
  for (const n of outcome.notes) log(`       · ${n}`);
  return { outcome, body };
}

const page = await check("document", base.href);
let commit = null;
if (page.outcome.result !== RESULT.PROTECTED && page.outcome.result !== RESULT.UNAVAILABLE && page.outcome.status === 200) {
  const found = discoverFromHtml(page.body);
  commit = commitCheck(found.commit, expectCommit);
  log(`${commit.result === RESULT.PASS ? "ok  " : "FAIL"} commit    ${commit.note}`);

  if (found.script) await check("script", new URL(found.script, base).href);
  if (found.font) await check("font", new URL(found.font, base).href);
  else log("     font      (no preloaded font in the page; skipped)");

  let workerJs = null;
  if (found.runtime) {
    const runtime = await request(new URL(found.runtime, base).href);
    for (const chunk of lazyChunksFromRuntime(runtime.body ?? "").slice(0, 40)) {
      const probe = await request(new URL(chunk, base).href);
      if (probe.body && isWorkerChunk(probe.body)) {
        workerJs = (await check("worker", new URL(chunk, base).href)).body;
        break;
      }
    }
  }
  if (!workerJs) {
    checks.push({ kind: "worker", result: RESULT.FAIL, problems: ["FFmpeg worker chunk not found via the webpack runtime"], notes: [] });
    log("FAIL worker    FFmpeg worker chunk not found via the webpack runtime");
  } else {
    const wasm = wasmUrlFromWorker(workerJs);
    if (wasm) await check("wasm", wasm, "HEAD");
  }

  await check("redirect", new URL("/privacy/", base).href);
  await check("notFound", new URL("/__reframe-deploy-check-404", base).href);
}

const results = checks.map((c) => c.result);
if (commit) results.push(commit.result);
if (page.outcome.status && page.outcome.status >= 500) results.push(RESULT.UNAVAILABLE);
const overall = overallResult(results);

const summary = {
  pass: "All checks passed.",
  fail: "Some checks failed.",
  protected: "Not checked: the deployment requires authentication (set VERCEL_AUTOMATION_BYPASS_SECRET for Vercel previews).",
  unavailable: "Not checked: the deployment could not be reached.",
}[overall];

if (json) console.log(JSON.stringify({ url: base.href, result: overall, commit, checks }, null, 2));
else console.log(`\n${summary}`);
process.exit(exitCode(overall));
