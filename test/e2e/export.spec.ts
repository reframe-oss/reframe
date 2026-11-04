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

/**
 * Average brightness (8-bit luma) of the top tenth of a frame. Black
 * letterbox bars are about 16; the test pattern is far brighter.
 */
function topStripLuma(path: string, at = 0.5): number {
  const out = execFileSync(
    "ffmpeg",
    [
      "-hide_banner", "-ss", String(at), "-i", path, "-frames:v", "1",
      "-vf", "crop=iw:ih/10:0:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
      "-f", "null", "-",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const match = out.match(/YAVG=([\d.]+)/);
  if (!match) throw new Error(`no YAVG in ffmpeg output: ${out.slice(0, 200)}`);
  return Number(match[1]);
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
      if (fixture.large) test.slow();

      await loadEditor(page, fixture.file);
      const isolated = await page.evaluate(() => crossOriginIsolated);
      expect(isolated).toBe(testInfo.project.name === "multi-threaded");

      // 1:1 output, so the expected size doesn't depend on the input's shape.
      await page.getByRole("button", { name: /^1 is to 1 output ratio/ }).click();

      await openSection(page, /^Trim\b/i);
      await page.getByLabel("Trim start time in seconds").fill("1");
      await page.getByLabel("Trim end time in seconds").fill("5");

      await openSection(page, /^Rotat/i);
      await page.getByRole("button", { name: "90° rotation" }).click();

      await openSection(page, /^Audio (&|and) speed/i);
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

  test("every edit in a sequence shows up in the exported file", async ({ page }, testInfo) => {
    await loadEditor(page, "normal.mp4");

    await openSection(page, /^Trim\b/i);
    await page.getByLabel("Trim start time in seconds").fill("1");
    await page.getByLabel("Trim end time in seconds").fill("5");

    // 9:16 with Fit: a landscape clip would be letterboxed with black bars,
    // so filling the frame proves the 90° rotation was applied.
    await page.getByRole("button", { name: /^9 is to 16 output ratio/ }).click();
    await openSection(page, /^Rotat/i);
    await page.getByRole("button", { name: "90° rotation" }).click();

    await openSection(page, /^Audio (&|and) speed/i);
    await page.getByRole("button", { name: "Set speed to 2x" }).click();
    await page.getByRole("button", { name: /^Mute video audio/ }).click();

    const out = testInfo.outputPath("sequence.mp4");
    await exportAndDownload(page, out);
    const result = probe(out);

    expect([result.width, result.height], "9:16 preset").toEqual([1080, 1920]);
    expect(result.duration, "trim 1–5 s at 2×").toBeGreaterThan(1.7);
    expect(result.duration).toBeLessThan(2.4);
    expect(result.audioStreams, "muted").toBe(0);
    expect(topStripLuma(out), "rotated: no letterbox bar at the top").toBeGreaterThan(40);
  });

  test("without rotation, the same 9:16 export is letterboxed (control for the rotation check)", async ({ page }, testInfo) => {
    await loadEditor(page, "normal.mp4");
    await page.getByRole("button", { name: /^9 is to 16 output ratio/ }).click();
    await openSection(page, /^Trim\b/i);
    await page.getByLabel("Trim end time in seconds").fill("2");
    const out = testInfo.outputPath("unrotated.mp4");
    await exportAndDownload(page, out);
    expect(topStripLuma(out)).toBeLessThan(25);
  });

  // Text overlays never exported: drawtext had an invalid option and no font.
  test("a text overlay exports and is drawn into the video", async ({ page }, testInfo) => {
    const exportWith = async (withText: boolean, name: string) => {
      await loadEditor(page, "normal.mp4");
      await openSection(page, /^Trim\b/i);
      await page.getByLabel("Trim end time in seconds").fill("1");
      if (withText) {
        await openSection(page, /^Text\b/i);
        await page.getByRole("button", { name: /Add Text/i }).click();
      }
      const out = testInfo.outputPath(name);
      await exportAndDownload(page, out);
      return out;
    };
    const plain = await exportWith(false, "plain.mp4");
    const withText = await exportWith(true, "text.mp4");
    // The default overlay starts at the horizontal centre, 20% from the top.
    const strip = (file: string) =>
      execFileSync("ffmpeg", ["-v", "error", "-ss", "0.5", "-i", file, "-frames:v", "1", "-vf", "crop=iw*0.12:ih*0.05:iw*0.5:ih*0.195,scale=32:8,format=gray", "-f", "rawvideo", "-"]);
    const a = strip(plain);
    const b = strip(withText);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    expect(diff / a.length, "mean pixel difference where the text is").toBeGreaterThan(5);
  });

  test("no-duration.webm: the editor finds the real length", async ({ page }) => {
    await loadEditor(page, "no-duration.webm");
    await openSection(page, /^Trim\b/i);
    // The end field's placeholder and limit are the clip's length (6 s), not
    // empty, 0 or Infinity, so trimming works on screen recordings.
    const end = page.getByLabel("Trim end time in seconds");
    await expect(end).toHaveAttribute("placeholder", "6.0");
    expect(Number(await end.getAttribute("max"))).toBeCloseTo(6, 1);
    // The file card shows the length (formats differ by UI: "Duration: 0:06", "… · 0:06").
    await expect(page.getByText(/(^|\s|·\s?)0:06\b/).first()).toBeVisible();
  });

  test("no-duration.webm at 2× speed without a trim exports the whole clip", async ({ page }, testInfo) => {
    await loadEditor(page, "no-duration.webm");
    await openSection(page, /^Audio (&|and) speed/i);
    await page.getByRole("button", { name: "Set speed to 2x" }).click();
    const out = testInfo.outputPath("no-duration-2x.mp4");
    await exportAndDownload(page, out);
    const result = probe(out);
    expect(result.duration).toBeGreaterThan(2.6);
    expect(result.duration).toBeLessThan(3.4);
  });
});
