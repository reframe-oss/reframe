import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Export profiles through the real UI: apply a built-in profile, pick the
// framing and format, export, and check the size of the file produced.
const FIXTURES = join(__dirname, "..", "fixtures");

function dimensions(path: string): [number, number] {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
    { encoding: "utf8" }
  );
  const [w, h] = out.trim().split(",").map(Number);
  return [w!, h!];
}

async function openSection(page: Page, name: RegExp) {
  const toggle = page.getByRole("button", { name }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

const cases = [
  { profile: "Square 1080", framing: "Fill", format: "MP4", size: [1080, 1080] },
  { profile: "Portrait 9 : 16", framing: "Fit", format: "WebM", size: [1080, 1920] },
  { profile: "Landscape 720p", framing: "Fill", format: "MKV", size: [1280, 720] },
  { profile: "Landscape 720p", framing: "Fit", format: "GIF", size: [1280, 720] },
] as const;

test.describe("export profiles", () => {
  for (const c of cases) {
    test(`${c.profile}, ${c.framing}, ${c.format} → ${c.size.join("×")}`, async ({ page }, testInfo) => {
      if (c.format === "GIF") test.slow();
      await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
      await page.goto("/");
      await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, "normal.mp4"));
      await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();

      // Keep the GIF small: 2 s is plenty to check its size.
      await openSection(page, /^Trim\b/i);
      await page.getByLabel("Trim end time in seconds").fill("2");

      await openSection(page, /^Profile\b/i);
      const profile = page.getByRole("button", { name: new RegExp(`^${c.profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) });
      await profile.click();
      await expect(profile).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("button", { name: new RegExp(`^${c.framing}\\b`) }).first().click();
      await page.getByRole("group", { name: "Format" }).getByRole("button", { name: c.format, exact: true }).click();

      // Safe-area guides are preview-only and can be shown while a profile is active.
      await page.getByRole("button", { name: /Safe area/i }).first().click();

      await page.getByRole("button", { name: "Export video" }).first().click();
      const link = page.getByRole("link", { name: /^Download (MP4|WEBM|MKV|GIF)$/ });
      await expect(link).toBeVisible({ timeout: 240_000 });
      const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
      const out = testInfo.outputPath(`profile.${c.format.toLowerCase()}`);
      await download.saveAs(out);
      expect(dimensions(out)).toEqual([...c.size]);
    });
  }
});
