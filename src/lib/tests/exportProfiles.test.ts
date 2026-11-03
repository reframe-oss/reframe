import { describe, it, expect } from "vitest";
import {
  BUILT_IN_PROFILES,
  MAX_USER_PROFILES,
  PROFILE_SCHEMA_VERSION,
  addProfile,
  applyProfile,
  cleanProfileName,
  deleteProfile,
  parseProfilesDoc,
  parseSettings,
  profileMatches,
  profileNotes,
  renameProfile,
  serializeProfiles,
  settingsFromRecipe,
  type ExportProfile,
  type ProfileSettings,
} from "../exportProfiles";
import { buildArguments, buildGifArguments, resolveOutputSize } from "../ffmpegArgs";
import { outputFrame } from "../framing";
import { toEditState } from "../project";
import { DEFAULT_RECIPE } from "../constants";
import { createDefaultTextOverlay } from "../text-overlay";
import type { EditRecipe } from "../types";

const edited = () => {
  const edit = toEditState({
    ...DEFAULT_RECIPE,
    trimStart: 2,
    trimEnd: 8,
    rotate: 90,
    speed: 1.5,
    brightness: 0.3,
    keepAudio: true,
    volume: 80,
    textOverlays: [createDefaultTextOverlay()],
  });
  return { ...edit, imageOverlay: { position: "top-left" as const, size: 250, opacity: 60 } };
};

const settings = (over: Partial<ProfileSettings> = {}): ProfileSettings => ({
  preset: "custom",
  customWidth: 640,
  customHeight: 480,
  framing: "fill",
  format: "webm",
  quality: 26,
  ...over,
});

describe("built-in profiles", () => {
  it.each([
    ["Landscape 1080p", 1920, 1080],
    ["Landscape 720p", 1280, 720],
    ["Square 1080", 1080, 1080],
    ["Portrait 4 : 5", 1080, 1350],
    ["Portrait 9 : 16", 1080, 1920],
  ])("%s encodes at %i × %i", (name, w, h) => {
    const p = BUILT_IN_PROFILES.find((x) => x.name === name)!;
    expect(resolveOutputSize(p.settings)).toEqual({ width: w, height: h });
    expect(p.settings).toMatchObject({ format: "mp4", quality: 23, framing: "fit" });
    expect(parseSettings(p.settings)).toEqual(p.settings);
  });

  it("don't name a platform", () => {
    for (const p of BUILT_IN_PROFILES) expect(p.name).not.toMatch(/youtube|tiktok|instagram|reels|shorts|twitter|facebook/i);
  });
});

describe("profiles drive the real FFmpeg command", () => {
  const formats = ["mp4", "webm", "mkv"] as const;
  const profilesToTest: ExportProfile[] = [
    ...BUILT_IN_PROFILES,
    { id: "user:odd", name: "Odd custom", builtIn: false, settings: settings({ customWidth: 641, customHeight: 481 }) },
  ];

  it.each(profilesToTest.flatMap((p) => [...formats.map((f) => [p, f] as const), [p, "gif"] as const]))(
    "%o as %s",
    (profile, format) => {
      const recipe: EditRecipe = { ...DEFAULT_RECIPE, ...applyProfile(toEditState(DEFAULT_RECIPE), { ...profile.settings, format }).recipe };
      const { width, height } = resolveOutputSize(recipe);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      const common = { recipe, inputName: "in.mp4", outputName: `out.${format}`, targetW: width, targetH: height, videoDuration: 6, threads: 0 };
      const cmd =
        format === "gif"
          ? buildGifArguments({ ...common, paletteName: "p.png" }).render.join(" ")
          : buildArguments({ ...common, format, hasOriginalAudio: true }).join(" ");
      expect(cmd).toContain(`scale=${width}:${height}:force_original_aspect_ratio=${recipe.framing === "fit" ? "decrease" : "increase"}`);
      expect(cmd).toContain(recipe.framing === "fit" ? `pad=${width}:${height}` : `crop=${width}:${height}`);
      if (format !== "gif") expect(cmd).toContain(`-crf ${format === "webm" ? Math.max(4, recipe.quality) : recipe.quality}`);
      if (format === "gif") expect(cmd).not.toMatch(/-c:a|-crf/);
    }
  );
});

describe("applying a profile", () => {
  it("changes only the output fields", () => {
    const before = edited();
    const after = applyProfile(before, settings());
    const outputKeys = ["preset", "customWidth", "customHeight", "framing", "format", "quality"];
    for (const [key, value] of Object.entries(before.recipe)) {
      if (!outputKeys.includes(key)) expect((after.recipe as Record<string, unknown>)[key], key).toEqual(value);
    }
    expect(after.imageOverlay).toEqual(before.imageOverlay);
    expect(settingsFromRecipe(after.recipe)).toEqual(settings());
  });

  it("keeps the custom size the user had when the profile uses a preset", () => {
    const before = edited();
    before.recipe.customWidth = 999;
    const after = applyProfile(before, BUILT_IN_PROFILES[0]!.settings);
    expect(after.recipe.customWidth).toBe(999);
    expect(profileMatches(after.recipe, BUILT_IN_PROFILES[0]!.settings)).toBe(true);
  });

  it("turns audio off for GIF, as picking GIF by hand does", () => {
    expect(applyProfile(edited(), settings({ format: "gif" })).recipe.keepAudio).toBe(false);
    expect(applyProfile(edited(), settings({ format: "mp4" })).recipe.keepAudio).toBe(true);
  });

  it("is matched only by an exact output", () => {
    const recipe = applyProfile(edited(), settings()).recipe;
    expect(profileMatches(recipe, settings())).toBe(true);
    expect(profileMatches(recipe, settings({ quality: 25 }))).toBe(false);
    expect(profileMatches(recipe, settings({ customWidth: 642 }))).toBe(false);
  });
});

describe("format notes", () => {
  it("explains GIF and warns about large GIFs", () => {
    expect(profileNotes(settings({ format: "gif", preset: "landscape-16-9" })).join(" ")).toMatch(/no audio.*Large GIF/);
    expect(profileNotes(settings({ format: "gif" })).join(" ")).not.toMatch(/Large GIF/);
  });
  it("shows the even-rounded size for odd custom sizes", () => {
    expect(profileNotes(settings({ customWidth: 641, customHeight: 481 }))).toEqual(["Exports at 642 × 482 (rounded to even numbers)."]);
    expect(profileNotes(settings())).toEqual([]);
  });
});

describe("validation and storage format", () => {
  it.each([
    ["unknown preset", { preset: "tiktok-max" }],
    ["fractional width", { customWidth: 640.5 }],
    ["too small", { customHeight: 8 }],
    ["too large", { customWidth: 9000 }],
    ["unknown framing", { framing: "stretch" }],
    ["unknown format", { format: "avi" }],
    ["quality out of range", { quality: 40 }],
    ["quality as a string", { quality: "23" }],
  ])("rejects %s", (_label, over) => {
    expect(parseSettings({ ...settings(), ...over })).toBeNull();
  });

  it("drops unknown keys", () => {
    expect(parseSettings({ ...settings(), trimStart: 5, __proto__x: 1 })).toEqual(settings());
  });

  it("round-trips user profiles and never stores built-ins", () => {
    const user: ExportProfile = { id: "user:abc", name: "Mine", builtIn: false, settings: settings() };
    const text = serializeProfiles([BUILT_IN_PROFILES[0]!, user]);
    expect(JSON.parse(text)).toEqual({ schemaVersion: PROFILE_SCHEMA_VERSION, profiles: [{ id: "user:abc", name: "Mine", settings: settings() }] });
    expect(parseProfilesDoc(text)).toEqual({ status: "ok", profiles: [user], dropped: 0 });
  });

  it("skips invalid and duplicate profiles but keeps the rest", () => {
    const good = { id: "user:a", name: "Good", settings: settings() };
    const text = JSON.stringify({
      schemaVersion: 1,
      profiles: [good, { id: "user:b", name: "Bad", settings: settings({ quality: 99 }) }, { ...good, id: "user:c", name: "good" }, { id: "nope", name: "X", settings: settings() }],
    });
    const result = parseProfilesDoc(text);
    expect(result).toMatchObject({ status: "ok", dropped: 3 });
    expect(result.status === "ok" && result.profiles.map((p) => p.id)).toEqual(["user:a"]);
  });

  it("reports empty, unreadable and newer documents distinctly", () => {
    expect(parseProfilesDoc(null)).toEqual({ status: "empty" });
    expect(parseProfilesDoc("{not json")).toEqual({ status: "unreadable" });
    expect(parseProfilesDoc(JSON.stringify({ schemaVersion: 1 }))).toEqual({ status: "unreadable" });
    expect(parseProfilesDoc(JSON.stringify({ schemaVersion: 9, profiles: [] }))).toEqual({ status: "newer", version: 9 });
  });

  it("upgrades older documents through the migration table", () => {
    // A hypothetical v1 → v2 that renamed `profiles` to `items` and back.
    const v1 = JSON.stringify({ schemaVersion: 1, items: [{ id: "user:a", name: "A", settings: settings() }] });
    const migrations = { 1: (doc: Record<string, unknown>) => ({ ...doc, profiles: doc.items }) };
    expect(parseProfilesDoc(v1, migrations, 2)).toMatchObject({ status: "ok", profiles: [{ id: "user:a" }] });
    expect(parseProfilesDoc(v1, {}, 2)).toEqual({ status: "unreadable" });
  });

  it("caps the number of stored profiles", () => {
    const many = Array.from({ length: MAX_USER_PROFILES + 5 }, (_, i) => ({ id: `user:p${i}`, name: `P${i}`, settings: settings() }));
    const result = parseProfilesDoc(JSON.stringify({ schemaVersion: 1, profiles: many }));
    expect(result.status === "ok" && result.profiles).toHaveLength(MAX_USER_PROFILES);
  });
});

describe("managing profiles", () => {
  it("cleans names and rejects empty, overlong or duplicate ones", () => {
    expect(cleanProfileName("  Story\u0007  cut  ")).toBe("Story cut");
    expect(cleanProfileName("   ")).toBeNull();
    expect(cleanProfileName("x".repeat(61))).toBeNull();
    expect(addProfile([], "landscape 1080P", settings(), "a")).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
  });

  it("adds, renames and deletes user profiles; built-ins are fixed", () => {
    const added = addProfile([], "Clips", settings(), "id1");
    expect(added.ok && added.profiles).toEqual([{ id: "user:id1", name: "Clips", builtIn: false, settings: settings() }]);
    if (!added.ok) return;
    const renamed = renameProfile(added.profiles, "user:id1", "Short clips");
    expect(renamed.ok && renamed.profiles[0]!.name).toBe("Short clips");
    expect(renameProfile(added.profiles, BUILT_IN_PROFILES[0]!.id, "Mine").ok).toBe(false);
    expect(deleteProfile(added.profiles, BUILT_IN_PROFILES[0]!.id).ok).toBe(false);
    const deleted = deleteProfile(added.profiles, "user:id1");
    expect(deleted.ok && deleted.profiles).toEqual([]);
  });

  it("enforces the profile limit", () => {
    const full = Array.from({ length: MAX_USER_PROFILES }, (_, i): ExportProfile => ({ id: `user:${i}`, name: `P${i}`, builtIn: false, settings: settings() }));
    expect(addProfile(full, "One more", settings(), "x")).toMatchObject({ ok: false, error: expect.stringMatching(/up to 30/) });
  });
});

describe("output frame in the preview", () => {
  const recipe = (preset: string, framing: "fit" | "fill") => ({ preset, customWidth: 0, customHeight: 0, framing });

  it("fit shows the output's own shape", () => {
    expect(outputFrame(recipe("vertical-9-16", "fit"))).toMatchObject({ top: "0%", left: "34.18%", right: "34.18%" });
    expect(outputFrame(recipe("landscape-16-9", "fit"))).toMatchObject({ top: "0%", left: "0%" });
    expect(outputFrame(recipe("ultrawide-21-9", "fit"))).toMatchObject({ left: "0%", top: "12.5%", bottom: "12.5%" });
  });

  it("fill of a portrait output from a 16:9 clip keeps a vertical strip (crops left/right)", () => {
    // FFmpeg: scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920
    // keeps 1080/3413 ≈ 31.6% of the source width.
    expect(outputFrame(recipe("vertical-9-16", "fill"), 16 / 9)).toEqual({ mode: "fill", top: "0%", bottom: "0%", left: "34.18%", right: "34.18%" });
  });

  it("fill accounts for a source that isn't 16:9", () => {
    // A 4:3 source is pillarboxed in the viewer (12.5% each side); a square
    // crop keeps the middle 75% of its width.
    expect(outputFrame(recipe("square-1-1", "fill"), 4 / 3)).toEqual({ mode: "fill", top: "0%", bottom: "0%", left: "21.875%", right: "21.875%" });
    // A 9:16 source to 16:9 output keeps a horizontal band of it.
    const band = outputFrame(recipe("landscape-16-9", "fill"), 9 / 16);
    expect(band.top).not.toBe("0%");
    expect(band.left).toBe("34.18%");
  });
});
