// Checks that a deployed Reframe URL actually sends the headers vercel.json
// declares — on the HTML document and on a static JS chunk (the FFmpeg worker
// script needs COEP too). Exit code 1 if any are missing or different.
//
// Usage: node scripts/perf/check-headers.mjs <url>
// For an SSO-protected Vercel preview, set VERCEL_AUTOMATION_BYPASS_SECRET
// (Project → Settings → Deployment Protection → Protection Bypass for
// Automation). The secret is sent as a header and never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/perf/check-headers.mjs <url>");
  process.exit(2);
}

const vercelJson = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vercel.json");
const rule = JSON.parse(fs.readFileSync(vercelJson, "utf8")).headers.find((h) => h.source === "/(.*)");
const expected = rule.headers;

const requestHeaders = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  requestHeaders["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

async function check(url) {
  const res = await fetch(url, { headers: requestHeaders, redirect: "manual" });
  console.log(`\n${res.status} ${url}`);
  if (res.status >= 300 && res.status < 400) {
    console.log(`  redirected to ${res.headers.get("location")?.split("?")[0]} — protected preview? set VERCEL_AUTOMATION_BYPASS_SECRET`);
    return { ok: false, body: "" };
  }
  let ok = res.ok;
  for (const { key, value } of expected) {
    const actual = res.headers.get(key);
    const pass = actual === value;
    ok &&= pass;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${key}: ${actual ?? "(missing)"}${pass ? "" : `  (expected ${value})`}`);
  }
  console.log(`  info Strict-Transport-Security: ${res.headers.get("strict-transport-security") ?? "(missing)"}`);
  return { ok, body: await res.text() };
}

const doc = await check(target);
const chunk = doc.body.match(/\/_next\/static\/[^"']+\.js/)?.[0];
let chunkOk = true;
if (chunk) chunkOk = (await check(new URL(chunk, target).href)).ok;
else console.log("\n(no /_next/static chunk found in the document to check)");

console.log(doc.ok && chunkOk ? "\nAll expected headers present." : "\nSome headers are missing or wrong.");
process.exit(doc.ok && chunkOk ? 0 : 1);
