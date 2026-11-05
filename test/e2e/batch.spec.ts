import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Batch export through the real UI: the current edit applied to two more
// videos, each exported at the output size, and the editor's own Export
// waiting while the batch runs.
const FIXTURES = join(__dirname, "..", "fixtures");

function probe(path: string): { width: number; height: number; duration: number } {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path],
    { encoding: "utf8" }
  );
  const json = JSON.parse(out);
  return { width: json.streams[0].width, height: json.streams[0].height, duration: Number(json.format.duration) };
}

test("batch export applies the edit to more videos, one at a time", async ({ page }, testInfo) => {
  test.slow();
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(join(FIXTURES, "normal.mp4"));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();

  // Square output, and a trim that must not carry over to the batch.
  const size = page.getByRole("button", { name: /^Size and framing/ }).first();
  if ((await size.getAttribute("aria-expanded")) === "false") await size.click();
  await page.getByRole("button", { name: /^1 is to 1 output ratio/ }).click();
  const trim = page.getByRole("button", { name: /^Trim\b/ }).first();
  if ((await trim.getAttribute("aria-expanded")) === "false") await trim.click();
  await page.getByLabel("Trim end time in seconds").fill("2");

  const section = page.getByRole("button", { name: /^Batch export/ }).first();
  await section.click();
  await page.getByTestId("batch-input").setInputFiles([join(FIXTURES, "portrait.mp4"), join(FIXTURES, "no-audio.mp4")]);
  const list = page.getByRole("list", { name: "Videos in the batch" });
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Export 2 videos", exact: true }).click();
  // While the batch runs, the editor's own Export is unavailable.
  await expect(page.getByRole("button", { name: "Cancel batch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeDisabled();

  await expect(list.locator('[data-status="done"]')).toHaveCount(2, { timeout: 240_000 });
  await expect(page.getByText("2 videos ready.")).toBeVisible();

  for (const [index, source] of ["portrait.mp4", "no-audio.mp4"].entries()) {
    const link = page.getByRole("link", { name: `Download ${source.replace(".mp4", "")}-reframe.mp4` });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe(`${source.replace(".mp4", "")}-reframe.mp4`);
    const out = testInfo.outputPath(`batch-${index}.mp4`);
    await download.saveAs(out);
    const info = probe(out);
    expect([info.width, info.height]).toEqual([1080, 1080]);
    // Full length: the 2 s trim belongs to the first video only.
    const source_ = probe(join(FIXTURES, source));
    expect(info.duration).toBeGreaterThan(source_.duration - 0.5);
  }
});
