import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Timed text through the real UI: an SRT file becomes caption items that the
// preview shows only during their cues, and the export draws each one only
// for its time.
const FIXTURES = join(__dirname, "..", "fixtures");

const SRT = `1
00:00:00,000 --> 00:00:01,500
CAPTION ONE

2
00:00:02,200 --> 00:00:02,900
TWO
`;

async function openSection(page: Page, name: RegExp) {
  const toggle = page.getByRole("button", { name }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function loadTrimmed(page: Page) {
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, "normal.mp4"));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
  await openSection(page, /^Trim\b/i);
  await page.getByLabel("Trim end time in seconds").fill("3");
}

async function exportAndDownload(page: Page, savePath: string) {
  await page.getByRole("button", { name: "Export video" }).first().click();
  const download = page.getByRole("link", { name: /^Download (MP4|WEBM|MKV|GIF)$/ });
  const failure = page.getByText(/^Export failed|stopped (responding|making progress)/).first();
  await expect(download.or(failure)).toBeVisible({ timeout: 180_000 });
  await expect(failure, "the export reported an error").toHaveCount(0);
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  await file.saveAs(savePath);
}

/** The caption band (bottom centre) of the frame at `at` seconds, as 32×8 grey pixels. */
function captionBand(file: string, at: number): Buffer {
  return execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1",
    "-vf", "crop=iw*0.3:ih*0.1:iw*0.35:ih*0.83,scale=32:8,format=gray", "-f", "rawvideo", "-",
  ]);
}

function meanDiff(a: Buffer, b: Buffer): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
  return diff / a.length;
}

async function seekPreview(page: Page, time: number) {
  await page.evaluate(async (t) => {
    const video = document.querySelector("video")!;
    video.pause();
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.currentTime = t;
    });
  }, time);
}

test("imported captions show only during their cues, in the preview and the export", async ({ page }, testInfo) => {
  test.slow();
  await loadTrimmed(page);
  const plain = testInfo.outputPath("plain.mp4");
  await exportAndDownload(page, plain);

  await loadTrimmed(page);
  await openSection(page, /^Text\b/i);
  await page.getByTestId("caption-input").setInputFiles({ name: "talk.srt", mimeType: "application/x-subrip", buffer: Buffer.from(SRT) });
  await expect(page.getByText("Added 2 captions.")).toBeVisible();
  await expect(page.getByRole("button", { name: /CAPTION ONE\s*0:00–0:01\.5/ })).toBeVisible();

  // The preview shows each caption only during its cue.
  const shown = page.getByTestId("text-overlay");
  await seekPreview(page, 0.5);
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveText("CAPTION ONE");
  await seekPreview(page, 1.8);
  await expect(shown).toHaveCount(0);
  await seekPreview(page, 2.5);
  await expect(shown).toHaveText("TWO");

  // An end before the start is refused, so the edit stays valid.
  await page.getByRole("button", { name: /^TWO\b/ }).click();
  await page.getByLabel("Text shows until").fill("1");
  await expect(page.getByText("End after the start time.")).toBeVisible();
  await page.getByLabel("Text shows until").blur();
  await expect(page.getByRole("button", { name: /TWO\s*0:02\.2–0:02\.9/ })).toBeVisible();

  const captioned = testInfo.outputPath("captioned.mp4");
  await exportAndDownload(page, captioned);

  expect(meanDiff(captionBand(plain, 0.5), captionBand(captioned, 0.5)), "caption one drawn at 0.5 s").toBeGreaterThan(5);
  expect(meanDiff(captionBand(plain, 1.8), captionBand(captioned, 1.8)), "nothing drawn between cues").toBeLessThan(2);
  expect(meanDiff(captionBand(plain, 2.5), captionBand(captioned, 2.5)), "caption two drawn at 2.5 s").toBeGreaterThan(5);
});
