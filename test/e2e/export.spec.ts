import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Fixtures come from scripts/make-fixtures.sh (test/fixtures/, gitignored).
const FIXTURES = join(__dirname, "..", "fixtures");

interface Fixture {
  file: string;
  hasAudio: boolean;
  /** Only with E2E_LARGE=1: slow, and needs a lot of memory. */
  large?: boolean;
}

const fixtures: Fixture[] = [
  { file: "normal.mp4", hasAudio: true },
  // No duration in the container, like a browser screen recording.
  { file: "no-duration.webm", hasAudio: true },
  { file: "portrait.mp4", hasAudio: true },
  { file: "no-audio.mp4", hasAudio: false },
  { file: "large.mp4", hasAudio: true, large: true },
];

interface Probe {
  width: number;
  height: number;
  duration: number;
  audioStreams: number;
}

function probe(path: string): Probe {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path],
    { encoding: "utf8" }
  );
  const json = JSON.parse(out) as {
    streams: { codec_type: string; width?: number; height?: number }[];
    format: { duration?: string };
  };
  const video = json.streams.find((s) => s.codec_type === "video");
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    duration: Number(json.format.duration ?? NaN),
    audioStreams: json.streams.filter((s) => s.codec_type === "audio").length,
  };
}

async function openSection(page: Page, name: RegExp) {
  const toggle = page.getByRole("button", { name }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function loadEditor(page: Page, fixture: string) {
  // Skip the onboarding tour, which covers the controls.
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').setInputFiles(join(FIXTURES, fixture));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
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

test.describe("export", () => {
  test.beforeAll(() => {
    const missing = fixtures.filter((f) => !f.large && !existsSync(join(FIXTURES, f.file)));
    if (missing.length) throw new Error(`Missing fixtures (${missing.map((f) => f.file).join(", ")}): run scripts/make-fixtures.sh`);
  });

  for (const fixture of fixtures) {
    test(`${fixture.file}: trim, rotate and speed up, then export a valid file`, async ({ page }, testInfo) => {
      test.skip(!!fixture.large && !process.env.E2E_LARGE, "set E2E_LARGE=1 to run the ~300 MB fixture");

      await loadEditor(page, fixture.file);
      const isolated = await page.evaluate(() => crossOriginIsolated);
      expect(isolated).toBe(testInfo.project.name === "multi-threaded");

      // 1:1 output, so the expected size doesn't depend on the input's shape.
      await page.getByRole("button", { name: "1 is to 1 output ratio" }).click();

      await openSection(page, /^Trim$/i);
      await page.getByLabel("Trim start time in seconds").fill("1");
      await page.getByLabel("Trim end time in seconds").fill("5");

      await openSection(page, /^Rotation$/i);
      await page.getByRole("button", { name: "Rotate video to 90 degrees" }).click();

      await openSection(page, /Audio & Speed/i);
      await page.getByRole("button", { name: "Set speed to 2x" }).click();

      const out = testInfo.outputPath(`${fixture.file}.mp4`);
      await exportAndDownload(page, out);

      const result = probe(out);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      // 4 s of source (1 s → 5 s) at 2× speed.
      expect(result.duration).toBeGreaterThan(1.7);
      expect(result.duration).toBeLessThan(2.4);
      expect(result.audioStreams).toBe(fixture.hasAudio ? 1 : 0);
    });
  }

  test("no-duration.webm: the editor finds the real length", async ({ page }) => {
    await loadEditor(page, "no-duration.webm");
    await openSection(page, /^Trim$/i);
    // The end field's placeholder and limit are the clip's length (6 s), not
    // empty, 0 or Infinity, so trimming works on screen recordings.
    const end = page.getByLabel("Trim end time in seconds");
    await expect(end).toHaveAttribute("placeholder", "6.0");
    expect(Number(await end.getAttribute("max"))).toBeCloseTo(6, 1);
    await expect(page.getByText("Duration: 0:06")).toBeVisible();
  });

  test("no-duration.webm at 2× speed without a trim exports the whole clip", async ({ page }, testInfo) => {
    await loadEditor(page, "no-duration.webm");
    await openSection(page, /Audio & Speed/i);
    await page.getByRole("button", { name: "Set speed to 2x" }).click();
    const out = testInfo.outputPath("no-duration-2x.mp4");
    await exportAndDownload(page, out);
    const result = probe(out);
    expect(result.duration).toBeGreaterThan(2.6);
    expect(result.duration).toBeLessThan(3.4);
  });
});
