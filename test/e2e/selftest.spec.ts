import { test, expect } from "@playwright/test";

// The same check the Datadog Synthetic test runs against production.
test("window.__reframeSelfTest loads the engine the page can use", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__reframeSelfTest === "function");
  const result = await page.evaluate(() => window.__reframeSelfTest!());
  const isolated = testInfo.project.name === "multi-threaded";
  expect(result).toMatchObject({ isolated, sharedArrayBuffer: isolated, engine: isolated ? "multi" : "single" });
  expect(result.error).toBeUndefined();
  expect(result.loadMs).toBeGreaterThan(0);
});
