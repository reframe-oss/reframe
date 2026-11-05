import { describe, it, expect } from "vitest";
import { buildTextFilter, createDefaultTextOverlay, isTextVisibleAt, textEnableExpression, TEXT_FONT_FILE } from "../text-overlay";
import { buildVideoFilter } from "../ffmpegArgs";
import { DEFAULT_RECIPE } from "../constants";

const overlay = (o: Partial<ReturnType<typeof createDefaultTextOverlay>> = {}) => ({ ...createDefaultTextOverlay(), ...o });

describe("buildTextFilter", () => {
  it("always uses the bundled font file (FFmpeg.wasm has no system fonts)", () => {
    const f = buildTextFilter(overlay({ fontFamily: "Inter" }), 1920, 1080);
    expect(f).toContain(`fontfile=${TEXT_FONT_FILE}`);
    // `font=` needs fontconfig, which FFmpeg.wasm lacks.
    expect(f).not.toMatch(/:font=/);
  });

  it("never passes fontweight, which drawtext doesn't have (it failed every text export)", () => {
    for (const fontWeight of ["normal", "bold", "900"] as const) {
      expect(buildTextFilter(overlay({ fontWeight }), 1920, 1080)).not.toContain("fontweight");
    }
  });

  it("draws bold as an outline in the text colour", () => {
    expect(buildTextFilter(overlay({ fontWeight: "normal" }), 1920, 1080)).not.toContain("borderw");
    const bold = buildTextFilter(overlay({ fontWeight: "bold", color: "#ff0000", fontSize: 56 }), 1920, 1080);
    expect(bold).toMatch(/borderw=2:bordercolor=#ff0000/);
  });

  it("centres the text on its position, as the preview does, and escapes drawtext's special characters", () => {
    const f = buildTextFilter(overlay({ text: "50% off: it's 'here'", x: 25, y: 10 }), 1000, 500);
    expect(f).toContain("x=250-text_w/2:y=50-text_h/2");
    expect(f).toContain("text='50%% off\\: it\\'s \\'here\\''");
  });
});

describe("timed text", () => {
  const timing = (o: Partial<{ trimStart: number; trimEnd: number | null; speed: number }> = {}) => ({
    trimStart: 0,
    trimEnd: null,
    speed: 1,
    ...o,
  });

  it("is on for the whole export when it has no start or end", () => {
    expect(textEnableExpression({}, timing())).toBe("");
    expect(buildTextFilter(overlay(), 1920, 1080)).not.toContain("enable=");
  });

  it("turns on and off at its start and end", () => {
    expect(textEnableExpression({ start: 1.5, end: 3 }, timing())).toBe("between(t,1.5,3)");
    expect(textEnableExpression({ start: 2 }, timing())).toBe("gte(t,2)");
    expect(textEnableExpression({ end: 4 }, timing())).toBe("lt(t,4)");
    expect(buildTextFilter(overlay({ start: 1, end: 2 }), 1920, 1080)).toMatch(/:enable='between\(t,1,2\)'$/);
  });

  it("follows the trim and speed, since drawtext sees the exported clip's time", () => {
    // Source 5–9 s, trimmed from 4 s, played at 2×: 0.5–2.5 s of the export.
    expect(textEnableExpression({ start: 5, end: 9 }, timing({ trimStart: 4, speed: 2 }))).toBe("between(t,0.5,2.5)");
    // Starts before the trim: on from the export's first frame.
    expect(textEnableExpression({ start: 1, end: 6 }, timing({ trimStart: 4 }))).toBe("lt(t,2)");
    // Ends after the trim end: on until the export's last frame.
    expect(textEnableExpression({ start: 5, end: 20 }, timing({ trimStart: 4, trimEnd: 10 }))).toBe("gte(t,1)");
  });

  it("is left out when it falls outside the kept part", () => {
    expect(textEnableExpression({ start: 1, end: 3 }, timing({ trimStart: 3 }))).toBeNull();
    expect(textEnableExpression({ start: 10 }, timing({ trimStart: 0, trimEnd: 10 }))).toBeNull();
    const filter = buildVideoFilter(
      { ...DEFAULT_RECIPE, trimStart: 5, trimEnd: 8, textOverlays: [overlay({ text: "early", start: 0, end: 2 }), overlay({ text: "kept" })] },
      1920,
      1080
    );
    expect(filter).not.toContain("early");
    expect(filter).toContain("text='kept'");
  });

  it("uses the recipe's trim and speed in the export filter", () => {
    const filter = buildVideoFilter(
      { ...DEFAULT_RECIPE, trimStart: 2, trimEnd: null, speed: 2, textOverlays: [overlay({ start: 4, end: 6 })] },
      1920,
      1080
    );
    expect(filter).toContain("enable='between(t,1,2)'");
  });

  it("draws a caption box when asked", () => {
    expect(buildTextFilter(overlay(), 1920, 1080)).not.toContain("box=1");
    expect(buildTextFilter(overlay({ box: true, fontSize: 40 }), 1920, 1080)).toContain("box=1:boxcolor=black@0.55:boxborderw=12");
  });

  it("shows in the preview from its start up to, not including, its end", () => {
    const o = { start: 1, end: 2 };
    expect(isTextVisibleAt(o, 0.99)).toBe(false);
    expect(isTextVisibleAt(o, 1)).toBe(true);
    expect(isTextVisibleAt(o, 2)).toBe(false);
    expect(isTextVisibleAt({}, 1e6)).toBe(true);
  });
});
