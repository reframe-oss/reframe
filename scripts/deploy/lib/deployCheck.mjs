// Rules for checking a deployed Reframe site. Pure functions, so they are
// unit-tested (src/lib/tests/deployCheck.test.ts); check-deploy.mjs does the
// fetching. Expected security headers come from vercel.json, which
// deployConfig.test.ts keeps identical to netlify.toml and public/_headers.

export const RESULT = { PASS: "pass", FAIL: "fail", PROTECTED: "protected", UNAVAILABLE: "unavailable" };

const EXIT = { pass: 0, fail: 1, protected: 3, unavailable: 4 };
export const exitCode = (result) => EXIT[result] ?? 1;

/** The catch-all header rule from vercel.json's text. */
export function expectedHeaders(vercelJsonText) {
  const rule = JSON.parse(vercelJsonText).headers.find((h) => h.source === "/(.*)");
  if (!rule) throw new Error("vercel.json has no catch-all header rule");
  return rule.headers;
}

const IMMUTABLE = (cache) => /immutable/.test(cache) && /max-age=31536000/.test(cache);
const REVALIDATE = (cache) => /max-age=0|no-cache/.test(cache);

/**
 * What each kind of response must look like. `security` = carries the site's
 * security headers (everything served from our origin does; the CDN's WASM
 * and bare redirects don't need to).
 */
export const KINDS = {
  document: { status: [200], type: /^text\/html/i, cache: REVALIDATE, cacheLabel: "revalidated", security: true },
  script: { status: [200], type: /javascript/i, cache: IMMUTABLE, cacheLabel: "immutable", security: true },
  font: { status: [200], type: /^font\/woff2/i, cache: IMMUTABLE, cacheLabel: "immutable", security: true },
  worker: { status: [200], type: /javascript/i, cache: IMMUTABLE, cacheLabel: "immutable", security: true },
  notFound: { status: [404], type: /^text\/html/i, security: true },
  redirect: { status: [200, 301, 302, 307, 308], security: false },
  wasm: { status: [200], type: /^application\/wasm/i, security: false, cors: true },
};

const lower = (headers) =>
  headers instanceof Map || typeof headers?.get === "function"
    ? (k) => headers.get(k)
    : (k) => headers[k.toLowerCase()] ?? headers[k] ?? null;

/**
 * Evaluates one response. `headers` is a Headers object or a plain object.
 * Returns { kind, url, status, result, problems: string[], notes: string[] }.
 */
export function checkResponse({ kind, url, status, headers, expected, location }) {
  const rule = KINDS[kind];
  const get = lower(headers);
  const problems = [];
  const notes = [];

  const authRedirect = status >= 300 && status < 400 && kind !== "redirect";
  if (status === 401 || status === 403 || authRedirect) {
    return { kind, url, status, result: RESULT.PROTECTED, problems: [], notes: [`needs authentication (${status}${location ? ` → ${location.split("?")[0]}` : ""})`] };
  }
  if (!rule.status.includes(status)) problems.push(`status ${status} (expected ${rule.status.join("/")})`);

  if (rule.security) {
    for (const { key, value } of expected) {
      const actual = get(key);
      if (actual !== value) problems.push(`${key}: ${actual ?? "(missing)"} (expected ${value})`);
    }
  }
  const type = get("content-type") ?? "";
  if (rule.type && !rule.type.test(type)) problems.push(`Content-Type: ${type || "(missing)"}`);
  const cache = get("cache-control") ?? "";
  if (rule.cache && !rule.cache(cache)) problems.push(`Cache-Control: ${cache || "(missing)"} (expected ${rule.cacheLabel})`);
  if (rule.cors) {
    const acao = get("access-control-allow-origin");
    if (acao !== "*") problems.push(`Access-Control-Allow-Origin: ${acao ?? "(missing)"} (COEP needs CORS here)`);
  }
  if (kind === "redirect" && status >= 300 && status < 400) {
    if (!location || !/\/privacy$/.test(location.split("?")[0])) problems.push(`redirects to ${location ?? "(nowhere)"}`);
    else notes.push(`${status} → ${location}`);
  }
  if (kind === "document") notes.push(`Strict-Transport-Security: ${get("strict-transport-security") ?? "(host default not sent)"}`);

  return { kind, url, status, result: problems.length ? RESULT.FAIL : RESULT.PASS, problems, notes };
}

/** fail beats unavailable beats protected beats pass. */
export function overallResult(results) {
  const seen = new Set(results);
  for (const r of [RESULT.FAIL, RESULT.UNAVAILABLE, RESULT.PROTECTED]) if (seen.has(r)) return r;
  return RESULT.PASS;
}

/** Same-origin resources referenced by the exported HTML. */
export function discoverFromHtml(html) {
  return {
    script: html.match(/\/_next\/static\/chunks\/[^"']+\.js/)?.[0] ?? null,
    runtime: html.match(/\/_next\/static\/chunks\/webpack-[^"']+\.js/)?.[0] ?? null,
    font: html.match(/\/_next\/static\/media\/[^"']+\.woff2/)?.[0] ?? null,
    commit: html.match(/<meta[^>]+name="reframe-build"[^>]+content="([^"]+)"/)?.[1] ?? null,
  };
}

/** Lazy chunk URLs from webpack's runtime (`id:"hash"` → /_next/static/chunks/id.hash.js). */
export function lazyChunksFromRuntime(runtimeJs) {
  const urls = new Set();
  for (const m of runtimeJs.matchAll(/(\d+):"([0-9a-f]{16})"/g)) urls.add(`/_next/static/chunks/${m[1]}.${m[2]}.js`);
  return [...urls];
}

/** The FFmpeg worker chunk is the one that names the jsDelivr cores. */
export const isWorkerChunk = (js) => js.includes("cdn.jsdelivr.net/npm/@ffmpeg/core");

export function wasmUrlFromWorker(js) {
  const base = js.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@ffmpeg\/core-mt@[\d.]+\/dist\/umd/)?.[0];
  return base ? `${base}/ffmpeg-core.wasm` : null;
}

/**
 * Compares the deployed build's commit with the one expected. A prefix match
 * of at least 7 characters counts; "+dirty" builds never match.
 */
export function commitCheck(actual, expected) {
  if (!expected) return { result: RESULT.PASS, note: `build commit: ${actual ?? "(not stamped)"}` };
  if (!actual) return { result: RESULT.FAIL, note: `build commit not stamped; expected ${expected}` };
  if (actual.endsWith("+dirty")) return { result: RESULT.FAIL, note: `deployed build has uncommitted changes (${actual})` };
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  const ok = e.length >= 7 && (a.startsWith(e) || e.startsWith(a));
  return ok
    ? { result: RESULT.PASS, note: `build commit ${actual} matches` }
    : { result: RESULT.FAIL, note: `STALE OR WRONG BUILD: serves ${actual}, expected ${expected}` };
}
