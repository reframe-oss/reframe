import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// The crop tool through the real UI. The fixture is colour bars, red first,
// so cropping to the left edge must export a red picture.
const FIXTURES = join(__dirname, "..", "fixtures");

async function openCrop(page: Page) {
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, "normal.mp4"));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
  const toggle = page.getByRole("button", { name: /^Crop\b/ }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(page.getByTestId("crop-box")).toBeVisible();
}

/** The colour at the centre of the first frame, as [r, g, b]. */
function centreColour(path: string): number[] {
  const out = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-vf", "crop=4:4:(iw-4)/2:(ih-4)/2,scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1024 }
  );
  return [...out.subarray(0, 3)];
}

test.describe("crop tool", () => {
  test("cropping to the red bar exports a red picture", async ({ page }, testInfo) => {
    await openCrop(page);
    await page.getByRole("button", { name: "Free", exact: true }).click();
    await page.getByLabel("Crop left in percent").fill("2");
    await page.getByLabel("Crop width in percent").fill("10");
    await expect(page.getByText(/Keeps \d+ × \d+ px/)).toBeVisible();

    await page.getByRole("button", { name: "Export video" }).first().click();
    const link = page.getByRole("link", { name: /^Download (MP4|WEBM|MKV|GIF)$/ });
    await expect(link).toBeVisible({ timeout: 180_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const out = testInfo.outputPath("crop.mp4");
    await download.saveAs(out);
    const [r, g, b] = centreColour(out);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
  });

  test("an aspect choice shapes the box, dragging resizes it, and reset clears it", async ({ page }) => {
    await openCrop(page);
    await page.getByRole("button", { name: "1 : 1", exact: true }).click();
    // 1:1 of a 16:9 source: 56.3% of the width, the full height.
    await expect(page.getByLabel("Crop width in percent")).toHaveValue("56.3");
    await expect(page.getByLabel("Crop height in percent")).toHaveValue("100");

    // Drag the bottom-right corner up and left: still square, smaller.
    // Wait until the layout has settled (the section is still opening), so
    // the handle is where the mouse goes.
    const corner = page.locator('[data-handle="se"]');
    await corner.scrollIntoViewIfNeeded();
    let box = (await corner.boundingBox())!;
    await expect
      .poll(async () => {
        const next = (await corner.boundingBox())!;
        const same = Math.abs(next.x - box.x) < 0.5 && Math.abs(next.y - box.y) < 0.5;
        box = next;
        return same;
      })
      .toBe(true);
    await corner.hover();
    await page.mouse.down();
    await page.mouse.move(box.x - 80, box.y - 80, { steps: 5 });
    await page.mouse.up();
    const width = Number(await page.getByLabel("Crop width in percent").inputValue());
    const height = Number(await page.getByLabel("Crop height in percent").inputValue());
    expect(width).toBeLessThan(56.3);
    expect((width * 16) / 9 / height).toBeCloseTo(1, 1);

    // Arrow keys move the box.
    const left = Number(await page.getByLabel("Crop left in percent").inputValue());
    await page.getByTestId("crop-box").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Crop left in percent")).toHaveValue(String(Math.round((left + 1) * 10) / 10));

    await page.getByRole("button", { name: "Reset crop" }).click();
    await expect(page.getByText("Whole frame")).toBeVisible();
    await expect(page.getByLabel("Crop width in percent")).toHaveValue("100");
  });
});
