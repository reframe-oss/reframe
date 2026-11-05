import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

// Audio through the real UI: a soundtrack replacing or mixed with the
// video's sound, and sound-only MP3 and WAV exports. normal.mp4's sound is a
// 440 Hz tone; the soundtrack made here is 1 kHz, so each can be measured.
const FIXTURES = join(__dirname, "..", "fixtures");

function streams(path: string): { codec_type: string; codec_name: string; sample_rate?: string }[] {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,sample_rate", "-of", "json", path], {
    encoding: "utf8",
  });
  return JSON.parse(out).streams;
}

function duration(path: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" }));
}

/** Mean level in dB of the sound around `hz` (a narrow band-pass). */
function bandLevel(path: string, hz: number): number {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-i", path, "-vn", "-af", `bandpass=f=${hz}:width_type=h:w=60,volumedetect`, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const match = run.stderr.match(/mean_volume: (-?[\d.]+) dB/);
  if (!match) throw new Error(`no level for ${hz} Hz: ${run.stderr.slice(-300)}`);
  return Number(match[1]);
}

async function openSection(page: Page, name: RegExp) {
  const toggle = page.getByRole("button", { name }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function load(page: Page, fixture: string) {
  await page.addInitScript(() => localStorage.setItem("reframe_onboarding_complete", "1"));
  await page.goto("/");
  await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(join(FIXTURES, fixture));
  await expect(page.getByRole("button", { name: "Export video" }).first()).toBeVisible();
  await openSection(page, /^Trim\b/i);
  await page.getByLabel("Trim end time in seconds").fill("3");
}

async function exportTo(page: Page, path: string, label: RegExp = /^Download (MP4|MP3|WAV)$/) {
  // "Export again" once a result is showing.
  await page.getByRole("button", { name: /^Export (video|again)$/ }).first().click();
  const download = page.getByRole("link", { name: label });
  await expect(download).toBeVisible({ timeout: 180_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  await file.saveAs(path);
}

async function chooseFormat(page: Page, label: string) {
  await openSection(page, /^Quality and processing/i);
  await page.getByRole("group", { name: "Format" }).getByRole("button", { name: label, exact: true }).click();
}

test.describe("audio", () => {
  let tone = "";
  test.beforeAll(({}, testInfo) => {
    tone = testInfo.outputPath("tone-1k.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=5", tone]);
  });

  test("a soundtrack replaces the video's sound, or is mixed with it", async ({ page }, testInfo) => {
    test.slow();
    await load(page, "normal.mp4");
    await openSection(page, /^Audio (&|and) speed/i);
    await page.getByTestId("soundtrack-input").setInputFiles(tone);
    await expect(page.getByRole("radio", { name: "Replace the video's sound" })).toHaveAttribute("aria-checked", "true");
    const replaced = testInfo.outputPath("replaced.mp4");
    await exportTo(page, replaced);
    // Only the track: 1 kHz far above what's left at 440 Hz.
    expect(bandLevel(replaced, 1000) - bandLevel(replaced, 440)).toBeGreaterThan(20);

    await openSection(page, /^Audio (&|and) speed/i);
    await page.getByRole("radio", { name: "Mix with it" }).click();
    await page.getByLabel("Video sound in the mix").fill("100");
    const mixed = testInfo.outputPath("mixed.mp4");
    await exportTo(page, mixed);
    // Both tones are there, within a few dB of each other.
    expect(Math.abs(bandLevel(mixed, 1000) - bandLevel(mixed, 440))).toBeLessThan(10);
    expect(duration(mixed)).toBeCloseTo(3, 0);
  });

  test("sound-only exports: MP3 and WAV of the trimmed sound", async ({ page }, testInfo) => {
    test.slow();
    await load(page, "normal.mp4");
    await chooseFormat(page, "MP3");
    await expect(page.getByText("Sound only").first()).toBeVisible();
    const mp3 = testInfo.outputPath("sound.mp3");
    await exportTo(page, mp3, /^Download MP3$/);
    expect(streams(mp3).map((s) => `${s.codec_type}:${s.codec_name}`)).toEqual(["audio:mp3"]);
    expect(duration(mp3)).toBeGreaterThan(2.8);
    expect(duration(mp3)).toBeLessThan(3.3);
    expect(bandLevel(mp3, 440) - bandLevel(mp3, 1000)).toBeGreaterThan(20);

    await chooseFormat(page, "WAV");
    const wav = testInfo.outputPath("sound.wav");
    await exportTo(page, wav, /^Download WAV$/);
    const [wavStream] = streams(wav);
    expect(wavStream).toMatchObject({ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "48000" });
    expect(duration(wav)).toBeCloseTo(3, 1);
  });

  test("a video without sound can't be exported as sound only", async ({ page }) => {
    await load(page, "no-audio.mp4");
    await chooseFormat(page, "MP3");
    await page.getByRole("button", { name: "Export video" }).first().click();
    await expect(page.getByText("This video has no sound to export.", { exact: false }).first()).toBeVisible({ timeout: 120_000 });
  });
});
