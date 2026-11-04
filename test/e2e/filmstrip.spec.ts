import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

// The trim timeline's filmstrip: frames made by FFmpeg in its worker, cached
// in the browser, and drawn behind the trim handles.
const FIXTURES = join(__dirname, "..", "fixtures");
const LONG_TASK_BUDGET_MS = 200;

declare global {
  interface Window {
    __longTasks: { start: number; duration: number }[];
  }
}

async function load(page: Page, fixture: string) {
  await page.addInitScript(() => {
    localStorage.setItem("reframe_onboarding_complete", "1");
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, fixture));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
  const trim = page.getByRole("button", { name: /^Trim\b/i }).first();
  if ((await trim.getAttribute("aria-expanded")) === "false") await trim.click();
}

const strip = (page: Page) => page.getByTestId("timeline-filmstrip");

async function framesDrawn(page: Page): Promise<number> {
  return strip(page)
    .locator("img")
    .evaluateAll((imgs) => imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length);
}

test.describe("timeline filmstrip", () => {
  test("FFmpeg fills the trim timeline with frames; clicking it seeks the preview", async ({ page }) => {
    await load(page, "normal.mp4");
    await expect(strip(page)).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
    await expect(strip(page)).toHaveAttribute("data-source", "engine");
    await expect.poll(() => framesDrawn(page)).toBe(16);
    const width = await strip(page).locator("img").first().evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(width).toBe(160);

    const trimStart = await page.getByRole("slider", { name: "Trim start" }).getAttribute("aria-valuenow");
    const box = (await page.getByRole("toolbar", { name: "Trim timeline" }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => document.querySelector("video")!.currentTime)).toBeGreaterThan(1);
    expect(await page.getByRole("slider", { name: "Trim start" }).getAttribute("aria-valuenow")).toBe(trimStart);
  });

  test("the same video opened again uses the cached frames", async ({ page }) => {
    await load(page, "normal.mp4");
    await expect(strip(page)).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
    await page.reload();
    await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, "normal.mp4"));
    const trim = page.getByRole("button", { name: /^Trim\b/i }).first();
    if ((await trim.getAttribute("aria-expanded")) === "false") await trim.click();
    await expect(strip(page)).toHaveAttribute("data-source", "cache", { timeout: 15_000 });
    await expect.poll(() => framesDrawn(page)).toBe(16);
  });

  test("an export started while frames are being made still completes, and the strip finishes after", async ({ page }) => {
    await load(page, "normal.mp4");
    await expect(strip(page)).toHaveAttribute("data-status", /loading|ready/);
    await page.getByRole("button", { name: "Export video" }).first().click();
    await expect(page.getByRole("link", { name: /^Download (MP4|WEBM|MKV|GIF)$/ })).toBeVisible({ timeout: 180_000 });
    await expect(strip(page)).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
    await expect.poll(() => framesDrawn(page)).toBe(16);
  });

  test("300 MB clip: making frames keeps the editor responsive", async ({ page }) => {
    test.skip(!process.env.E2E_LARGE, "set E2E_LARGE=1 to run the ~300 MB fixture");
    test.slow();
    await load(page, "large.mp4");
    const start = await page.evaluate(() => performance.now());

    // Move a trim handle while frames are still being made.
    await expect(strip(page)).toHaveAttribute("data-status", "loading");
    const handle = page.getByRole("slider", { name: "Trim start" });
    await handle.focus();
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    const perStep = (Date.now() - t0) / 20;

    await expect(strip(page)).toHaveAttribute("data-status", "ready", { timeout: 180_000 });
    const tasks = await page.evaluate((t) => window.__longTasks.filter((task) => task.start >= t), start);
    const worst = Math.max(0, ...tasks.map((t) => t.duration));
    test.info().annotations.push({ type: "measurement", description: `trim step ${perStep.toFixed(1)} ms; worst long task ${Math.round(worst)} ms` });
    expect(perStep).toBeLessThan(100);
    expect(worst).toBeLessThan(LONG_TASK_BUDGET_MS);
  });
});
