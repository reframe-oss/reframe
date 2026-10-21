// Interaction benchmarks for Reframe. Usage: node bench.cjs <url> <label> <fixture>
// Runs the same scenarios against any build; selectors are chosen to exist in
// both the baseline and the redesigned UI.
const fs = require("fs");
const { launch } = require("./browser.js");
const [url, label, fixture] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { label, url, fixture, scenarios: {} };

async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}
function delta(a, b, keys) {
  return Object.fromEntries(keys.map((k) => [k, +(b[k] - a[k]).toFixed(k.endsWith("Duration") ? 3 : 0)]));
}
const KEYS = ["ScriptDuration", "TaskDuration", "LayoutCount", "RecalcStyleCount"];

async function instrument(page) {
  await page.evaluateOnNewDocument(() => {
    window.__lt = []; window.__ev = []; window.__rs = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ev.push({ n: e.name, d: e.duration }))).observe({ type: "event", durationThreshold: 16, buffered: true });
    const orig = History.prototype.replaceState;
    History.prototype.replaceState = function (...a) { window.__rs++; return orig.apply(this, a); };
    localStorage.setItem("reframe_onboarding_complete", "1");
    localStorage.setItem("theme", "light");
  });
}

async function openEditor(page) {
  await page.goto(url, { waitUntil: "networkidle0" });
  const t0 = Date.now();
  const input = await page.$('input[type="file"][accept="video/*"]');
  await input.uploadFile(fixture);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2; }, { timeout: 20000 });
  const previewMs = Date.now() - t0;
  await page.waitForFunction(() => /\d+ frames/.test(document.body.innerText), { timeout: 30000 });
  const thumbsMs = Date.now() - t0;
  return { previewMs, thumbsMs };
}

async function clickByText(page, text) {
  const ok = await page.evaluate((text) => {
    const b = [...document.querySelectorAll("button")].find((el) => el.textContent.trim().toLowerCase().includes(text) && el.offsetParent !== null);
    if (b) b.click();
    return !!b;
  }, text);
  if (!ok) throw new Error("button not found: " + text);
}

async function workerCount(cdp) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return targetInfos.filter((t) => t.type === "worker").length;
}

async function runExport(page, { cancelAtPercent } = {}) {
  await page.evaluate(() => {
    window.__progressUpdates = 0; window.__maxGap = 0; window.__lt = [];
    const mo = new MutationObserver(() => window.__progressUpdates++);
    window.__mo = mo;
    const attach = () => { const pb = document.querySelector('[role="dialog"] [role="progressbar"]'); if (pb) mo.observe(pb, { attributes: true, attributeFilter: ["aria-valuenow"] }); else setTimeout(attach, 50); };
    attach();
    // Frame-gap monitor: the longest gap between animation frames while exporting.
    let last = performance.now(); window.__raf = true;
    const tick = (t) => { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; if (window.__raf) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.click("#export-button");
  await page.waitForFunction(() => /^Exporting/.test(document.title) || document.querySelector('[role="alert"]'), { timeout: 120000 });
  const engineMs = Date.now() - t0;
  let result;
  if (cancelAtPercent != null) {
    await page.waitForFunction((p) => Number(document.querySelector('[role="dialog"] [role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0) >= p, { timeout: 120000 }, cancelAtPercent);
    const c0 = Date.now();
    await clickByText(page, "cancel export");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'), { timeout: 10000 });
    result = { cancelled: true, cancelToIdleMs: Date.now() - c0 };
  } else {
    await page.waitForFunction(() => /Export complete/.test(document.body.innerText) || document.querySelector('[role="alert"]'), { timeout: 300000 });
    const ok = await page.evaluate(() => /Export complete/.test(document.body.innerText));
    result = { ok, totalMs: Date.now() - t0, encodeMs: Date.now() - t0 - engineMs };
  }
  const extra = await page.evaluate(() => {
    window.__raf = false; window.__mo.disconnect();
    return { progressDomUpdates: window.__progressUpdates, maxFrameGapMs: Math.round(window.__maxGap), longTasks: window.__lt.length, longestTaskMs: Math.round(Math.max(0, ...window.__lt)) };
  });
  return { engineMs, ...result, ...extra };
}

(async () => {
  const browser = await launch();
  const ver = await browser.version();
  out.env = { browser: ver, os: process.platform, node: process.version };

  // ── 1–3: upload, playback, sliders ──────────────────────────────────────
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await instrument(page);
    const cdp = await page.createCDPSession();
    await cdp.send("Performance.enable");
    out.scenarios.upload = await openEditor(page);

    // Playback: 5 s of playing video, main-thread cost attributable to the page.
    await page.evaluate(() => { window.__lt = []; const v = document.querySelector("video"); v.currentTime = 0; v.loop = true; return v.play(); });
    const m0 = await metrics(cdp);
    await sleep(5000);
    const m1 = await metrics(cdp);
    out.scenarios.playback5s = { ...delta(m0, m1, KEYS), longTasks: await page.evaluate(() => window.__lt.length) };
    await page.evaluate(() => document.querySelector("video").pause());

    // Sliders: 30 keyboard steps on brightness, 40 ms apart (a quick drag).
    const visible = await page.$eval("#brightness-slider", (el) => el.offsetParent !== null).catch(() => false);
    if (!visible) await clickByText(page, "adjust colour");
    await page.evaluate(() => { window.__ev = []; window.__rs = 0; window.__lt = []; });
    await page.focus("#brightness-slider");
    await page.keyboard.press("Home");
    const s0 = await metrics(cdp);
    for (let i = 0; i < 30; i++) { await page.keyboard.press(i < 15 ? "ArrowRight" : "ArrowLeft"); await sleep(40); }
    await sleep(600);
    const s1 = await metrics(cdp);
    const ev = await page.evaluate(() => ({ events: window.__ev.filter((e) => /key|input/.test(e.n)).map((e) => e.d), rs: window.__rs, lt: window.__lt.length }));
    const sorted = ev.events.slice().sort((a, b) => a - b);
    out.scenarios.slider30 = {
      ...delta(s0, s1, KEYS),
      slowEvents16ms: sorted.length,
      maxEventMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
      replaceStateCalls: ev.rs,
      longTasks: ev.lt,
    };
    await ctx.close();
  }

  // ── 4–7: exports (fresh context = cold engine) ───────────────────────────
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await instrument(page);
    page.on("dialog", (d) => d.accept());
    const cdp = await page.createCDPSession();
    await openEditor(page);
    out.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);

    // Failed engine load (CDN blocked), then a successful retry.
    // Browser-level interception also covers requests made inside workers.
    const bcdp = await browser.target().createCDPSession();
    let blocking = true;
    bcdp.on("Fetch.requestPaused", (e) => {
      if (blocking && e.request.url.includes("cdn.jsdelivr.net")) bcdp.send("Fetch.failRequest", { requestId: e.requestId, errorReason: "InternetDisconnected" }).catch(() => {});
      else bcdp.send("Fetch.continueRequest", { requestId: e.requestId }).catch(() => {});
    });
    await bcdp.send("Fetch.enable", { patterns: [{ urlPattern: "*cdn.jsdelivr.net*" }] });
    const f0 = Date.now();
    await page.click("#export-button");
    // Both UIs show a "Retry export" button on failure (the baseline's box is role=status).
    const hasRetry = () => [...document.querySelectorAll("button")].some((b) => /retry export/i.test(b.textContent));
    await page.waitForFunction(hasRetry, { timeout: 60000 });
    const failText = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /retry export/i.test(b.textContent)).closest("div[role]").innerText.slice(0, 160));
    const failMs = Date.now() - f0;
    blocking = false;
    await bcdp.send("Fetch.disable");
    const r0 = Date.now();
    await clickByText(page, "retry export");
    await page.waitForFunction(() => /Export complete/.test(document.body.innerText) || (document.querySelector('[role="alert"]') && !/^Exporting|Loading/.test(document.title) && false), { timeout: 300000 });
    out.scenarios.failThenRetry = { failMs, failText, retryOk: true, retryTotalMs: Date.now() - r0, workersAfter: await workerCount(cdp) };

    // Common resolutions (engine now warm).
    out.scenarios.exports = {};
    for (const [name, title] of [["720p", "16 : 9 — 1280×720"], ["1080p", "16 : 9 — 1920×1080"], ["1080x1920", "9 : 16 — 1080×1920"]]) {
      await page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => (b.title || "").startsWith(t))?.click(), title);
      await sleep(200);
      out.scenarios.exports[name] = await runExport(page);
    }

    // Repeated export → cancel cycles: worker count must not grow.
    const cycles = [];
    for (let i = 0; i < 3; i++) {
      const r = await runExport(page, { cancelAtPercent: 5 });
      await sleep(500);
      cycles.push({ ...r, workersAfterCancel: await workerCount(cdp) });
    }
    out.scenarios.exportCancelCycles = cycles;
    // And a successful export after cancelling.
    out.scenarios.exportAfterCancel = await runExport(page);
    out.scenarios.exportAfterCancel.workers = await workerCount(cdp);
    await sleep(5000);
    out.scenarios.exportAfterCancel.workersAfter5s = await workerCount(cdp);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(process.env.OUT || `bench-${label}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("BENCH FAILED", e); process.exit(1); });
