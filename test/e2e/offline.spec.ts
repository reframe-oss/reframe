import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Offline support through the real browser: the service worker saves the
// app and the video engine, then with the network off the editor still
// opens, is cross-origin isolated exactly as online, and exports.
const FIXTURES = join(__dirname, "..", "fixtures");

async function openVideo(page: Page) {
  await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(join(FIXTURES, "normal.mp4"));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
}

test("the editor opens and exports with the network off once it has been used online", async ({ page, context }, testInfo) => {
  test.slow();
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  const onlineIsolated = await page.evaluate(() => crossOriginIsolated);
  expect(onlineIsolated).toBe(testInfo.project.name === "multi-threaded");

  // The worker installs, precaches the app and takes control of the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  const status = page.getByTestId("offline-status");
  await expect(status).toHaveAttribute("data-state", "needs-engine");

  // Opening a video loads the engine (for the filmstrip), which the worker keeps.
  await openVideo(page);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 120_000 });
  await expect(status).toHaveText("Works offline");

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('input[type=file][accept="video/*"]').first()).toBeAttached();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  // Same isolation as online, so the same engine loads.
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(onlineIsolated);

  await openVideo(page);
  await page.getByRole("button", { name: /^Trim\b/ }).first().click();
  await page.getByLabel("Trim end time in seconds").fill("2");
  await page.getByRole("button", { name: "Export video" }).first().click();
  const download = page.getByRole("link", { name: /^Download MP4$/ });
  await expect(download).toBeVisible({ timeout: 180_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  const out = testInfo.outputPath("offline.mp4");
  await file.saveAs(out);
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }));
  expect(seconds).toBeGreaterThan(1.8);
  expect(seconds).toBeLessThan(2.3);
});

test("the app can be installed: the manifest is linked and complete", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: expect.any(String), short_name: "Reframe", start_url: "/", display: "standalone" });
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
