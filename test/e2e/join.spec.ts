import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Joining through the real UI: clips reordered, joined at the first clip's
// size with a silent clip kept in step, the result used as the editor's
// video, and undo going back to the clips.
const FIXTURES = join(__dirname, "..", "fixtures");

function probe(path: string): { duration: number; audioStreams: number } {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", path], {
    encoding: "utf8",
  });
  const json = JSON.parse(out) as { streams: { codec_type: string }[]; format: { duration: string } };
  return { duration: Number(json.format.duration), audioStreams: json.streams.filter((s) => s.codec_type === "audio").length };
}

/** The editor preview's video size and length. */
const previewVideo = (page: Page) =>
  page.evaluate(() => {
    const video = document.querySelector("video")!;
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  });

test("join reorders clips, fits them to the first clip and replaces the editor's video", async ({ page }, testInfo) => {
  test.slow();
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(join(FIXTURES, "normal.mp4"));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();

  await page.getByRole("button", { name: /^Join clips/ }).first().click();
  await page.getByTestId("join-input").setInputFiles([join(FIXTURES, "portrait.mp4"), join(FIXTURES, "no-audio.mp4")]);
  const list = page.getByRole("list", { name: "Clips to join, in order" });
  await expect(list.locator('[data-status="ready"]')).toHaveCount(3);

  // Portrait first, so the joined video is 720 × 1280.
  await page.getByRole("button", { name: "Move portrait.mp4 earlier" }).click();
  await expect(list.getByRole("listitem").first()).toContainText("portrait.mp4");
  await expect(page.getByRole("button", { name: "Move portrait.mp4 earlier" })).toBeDisabled();
  await expect(page.getByText(/first clip's size \(720 × 1280\)/)).toBeVisible();

  await page.getByRole("button", { name: "Join 3 clips" }).click();
  // The engine is taken while joining.
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeDisabled();
  await expect(page.getByText("Joined 3 clips.", { exact: false })).toBeVisible({ timeout: 240_000 });

  // The editor now shows the joined video: 6 + 10 + 6 seconds at the portrait size.
  await expect(page.getByText("portrait-joined.mp4").first()).toBeVisible();
  await expect.poll(async () => (await previewVideo(page)).width, { timeout: 15_000 }).toBe(720);
  const joined = await previewVideo(page);
  expect(joined.height).toBe(1280);
  expect(joined.duration).toBeGreaterThan(21.5);
  expect(joined.duration).toBeLessThan(22.5);

  // Exporting it works as usual, and the silent clip didn't drop the sound.
  await page.getByRole("button", { name: "Export video" }).first().click();
  const download = page.getByRole("link", { name: /^Download (MP4|WEBM|MKV|GIF)$/ });
  await expect(download).toBeVisible({ timeout: 240_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  const out = testInfo.outputPath("joined-export.mp4");
  await file.saveAs(out);
  const exported = probe(out);
  expect(exported.audioStreams).toBe(1);
  expect(exported.duration).toBeGreaterThan(21.5);
  expect(exported.duration).toBeLessThan(22.5);

  // Undo goes back to the first video and the three clips.
  await page.getByRole("button", { name: /^Join clips/ }).first().scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Undo join" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect.poll(async () => (await previewVideo(page)).width, { timeout: 15_000 }).toBe(1280);
});
