// Export validation matrix for one build/serving mode. Complements bench.js
// (which measures timings): this checks behaviour.
//   - which FFmpeg core the worker actually fetched (core-mt vs core)
//   - COEP-blocked requests and Datadog requests (a localhost run must send none)
//   - cancel during engine load, then a successful export
//   - MP4 with sharpness + volume, WebM and GIF exports
// Usage: [ONLY=webm,gif] node matrix.js <url> <label> <fixture>   (see docs/PERFORMANCE.md)
const fs = require("fs");
const { launch } = require("./browser.js");
const [url, label, fixture] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { label, url, fixture, scenarios: {} };
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const want = (name) => !only || only.includes(name);

async function track(browser) {
  // Browser-level interception sees requests made inside workers too.
  const seen = { coreMt: 0, core: 0, datadog: 0, total: 0 };
  const cdp = await browser.target().createCDPSession();
  cdp.on("Fetch.requestPaused", (e) => {
    const u = e.request.url;
    seen.total++;
    if (u.includes("@ffmpeg/core-mt@")) seen.coreMt++;
    else if (u.includes("@ffmpeg/core@")) seen.core++;
    if (/datadoghq|browser-intake/.test(u)) seen.datadog++;
    cdp.send("Fetch.continueRequest", { requestId: e.requestId }).catch(() => {});
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  return seen;
}

async function newEditor(browser, query = "") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const blocked = [];
  page.on("console", (m) => { if (/Cross-Origin-Embedder-Policy|ERR_BLOCKED_BY_RESPONSE/i.test(m.text())) blocked.push(m.text().slice(0, 160)); });
  page.on("requestfailed", (r) => { if (/BLOCKED/i.test(r.failure()?.errorText ?? "")) blocked.push(r.url()); });
  page.on("dialog", (d) => d.accept());
  const cdp = await page.createCDPSession();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("reframe_onboarding_complete", "1");
    localStorage.setItem("reframe_privacy_banner_dismissed_until", String(Date.now() + 864e5));
  });
  await page.goto(url + query, { waitUntil: "networkidle0" });
  out.crossOriginIsolated ??= await page.evaluate(() => crossOriginIsolated);
  const input = await page.$('input[type="file"][accept="video/*"]');
  await input.uploadFile(fixture);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2; }, { timeout: 20000 });
  return { ctx, page, cdp, blocked };
}

async function workerCount(cdp) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return targetInfos.filter((t) => t.type === "worker").length;
}

const clickByText = (page, text) =>
  page.evaluate((text) => {
    const b = [...document.querySelectorAll("button")].find((el) => el.textContent.trim().toLowerCase().includes(text) && el.offsetParent !== null);
    b?.click();
    return Boolean(b);
  }, text);

async function exportOnce(page) {
  const t0 = Date.now();
  await page.click("#export-button");
  await page.waitForFunction(
    () => /Export complete/.test(document.body.innerText) || [...document.querySelectorAll("button")].some((b) => /retry export/i.test(b.textContent)),
    { timeout: 240000 }
  );
  const res = await page.evaluate(() => {
    const ok = /Export complete/.test(document.body.innerText);
    const err = [...document.querySelectorAll("button")].find((b) => /retry export/i.test(b.textContent))?.closest("div[role]")?.innerText.slice(0, 200);
    const a = [...document.querySelectorAll("a[download]")].map((x) => x.getAttribute("download"))[0] ?? null;
    const size = document.body.innerText.match(/\d+ × \d+ · ([\d.]+ [KM]B)/)?.[1] ?? null;
    return { ok, error: ok ? null : err, download: a, size };
  });
  return { ...res, totalMs: Date.now() - t0 };
}

(async () => {
  const browser = await launch();
  out.env = { browser: await browser.version(), os: process.platform, cores: require("os").cpus().length };
  const seen = await track(browser);

  // 1. Cancel while the engine is loading, then export.
  if (want("cancelDuringLoad")) {
    const { ctx, page, cdp, blocked } = await newEditor(browser);
    await page.click("#export-button");
    await page.waitForFunction(() => /Loading engine/.test(document.title), { timeout: 10000 });
    const c0 = Date.now();
    const clicked = await clickByText(page, "cancel export");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), { timeout: 10000 });
    const cancelToIdleMs = Date.now() - c0;
    await sleep(300);
    const workersAfterCancel = await workerCount(cdp);
    const next = await exportOnce(page);
    out.scenarios.cancelDuringLoad = { clicked, cancelToIdleMs, workersAfterCancel, next, workersAfter: await workerCount(cdp), blocked };
    await ctx.close();
  }

  // 2. Formats and the settings the worker used to ignore.
  for (const [name, query] of [
    ["mp4-sharpness-volume", "?sharpness=2&volume=50"],
    ["webm", "?format=webm"],
    ["gif", "?format=gif"],
  ]) {
    if (!want(name)) continue;
    const { ctx, page, blocked } = await newEditor(browser, query);
    out.scenarios[name] = { ...(await exportOnce(page)), blocked };
    await ctx.close();
  }

  await sleep(2000);
  out.requests = seen;
  await browser.close();
  fs.writeFileSync(process.env.OUT || `matrix-${label}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("MATRIX FAILED", e); process.exit(1); });
