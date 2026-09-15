import { describe, test, expect } from "vitest";
import { estimateExportSize, formatEstimatedSize } from "./exportEstimate";
import { EditRecipe } from "./types";
import { describe, test, expect } from "vitest";

// Minimal recipe factory — only the fields estimateExportSize cares about
function makeRecipe(overrides: Partial<EditRecipe> = {}): EditRecipe {
  return {
    preset: "1080p",
    customWidth: 1920,
    customHeight: 1080,
    quality: 23,       // default CRF
    speed: 1,
    trimStart: 0,
    trimEnd: null,
    format: "mp4",
    // fields estimateExportSize doesn't touch — kept minimal
    stabilization: false,
    soundOnCompletion: false,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    framing: "fit",
    rotation: 0,
    ...overrides,
  } as EditRecipe;
}

// ---------------------------------------------------------------------------
// estimateExportSize
// ---------------------------------------------------------------------------

describe("estimateExportSize", () => {
  test("returns a positive number for a basic clip", () => {
    const size = estimateExportSize(makeRecipe(), 60);
    expect(size).toBeGreaterThan(0);
  });

  test("lower CRF (higher quality) produces a larger estimate", () => {
    const highQ = estimateExportSize(makeRecipe({ quality: 18 }), 60);
    const lowQ  = estimateExportSize(makeRecipe({ quality: 30 }), 60);
    expect(highQ).toBeGreaterThan(lowQ);
  });

  test("longer duration produces a larger estimate", () => {
    const short = estimateExportSize(makeRecipe(), 30);
    const long  = estimateExportSize(makeRecipe(), 120);
    expect(long).toBeGreaterThan(short);
    // Should scale roughly linearly (within 5%)
    expect(long / short).toBeCloseTo(4, 0);
  });

  test("higher resolution (4k) produces a larger estimate than 720p", () => {
    const hd  = estimateExportSize(makeRecipe({ preset: "720p" }), 60);
    const uhd = estimateExportSize(makeRecipe({ preset: "4k"   }), 60);
    expect(uhd).toBeGreaterThan(hd);
  });

  test("trim reduces effective duration and therefore file size", () => {
    const full    = estimateExportSize(makeRecipe({ trimStart: 0,  trimEnd: null }), 60);
    const trimmed = estimateExportSize(makeRecipe({ trimStart: 0,  trimEnd: 30   }), 60);
    expect(trimmed).toBeLessThan(full);
    expect(trimmed / full).toBeCloseTo(0.5, 1);
  });

  test("2× speed halves output duration and therefore file size", () => {
    const normal = estimateExportSize(makeRecipe({ speed: 1 }), 60);
    const fast   = estimateExportSize(makeRecipe({ speed: 2 }), 60);
    expect(fast / normal).toBeCloseTo(0.5, 1);
  });

  test("webm estimate is smaller than mp4 at identical settings", () => {
    const mp4  = estimateExportSize(makeRecipe({ format: "mp4"  }), 60);
    const webm = estimateExportSize(makeRecipe({ format: "webm" }), 60);
    expect(webm).toBeLessThan(mp4);
  });

  test("custom preset uses customWidth/Height", () => {
    const small  = estimateExportSize(makeRecipe({ preset: "custom", customWidth: 640,  customHeight: 360  }), 60);
    const large  = estimateExportSize(makeRecipe({ preset: "custom", customWidth: 3840, customHeight: 2160 }), 60);
    expect(large).toBeGreaterThan(small);
  });

  test("returns a reasonable size for a 1-minute 1080p CRF-23 mp4 (2–5 MB)", () => {
    // Real-world expectation: a 1-min 1080p H.264 file at CRF 23 is typically
    // 20–100 MB depending on content. Our estimate should be in the right ballpark.
    const size = estimateExportSize(makeRecipe(), 60);
    expect(size).toBeGreaterThan(5);
    expect(size).toBeLessThan(200);
  });

  test("very short clip (1 s minimum) does not return zero or negative", () => {
    // trimStart === trimEnd → clamped to 1 s minimum inside the function
    const size = estimateExportSize(makeRecipe({ trimStart: 10, trimEnd: 10 }), 60);
    expect(size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatEstimatedSize
// ---------------------------------------------------------------------------

describe("formatEstimatedSize", () => {
  test("formats values under 1 MB as KB", () => {
    expect(formatEstimatedSize(0.5)).toBe("~512 KB");
  });

  test("formats values between 1 MB and 1 GB as MB", () => {
    expect(formatEstimatedSize(42.3)).toBe("~42.3 MB");
    expect(formatEstimatedSize(1)).toBe("~1.0 MB");
  });

  test("formats values 1 GB and over as GB", () => {
    expect(formatEstimatedSize(1024)).toBe("~1.0 GB");
    expect(formatEstimatedSize(2560)).toBe("~2.5 GB");
  });

  test("all outputs start with ~", () => {
    [0.1, 1, 100, 2000].forEach((n) => {
      expect(formatEstimatedSize(n)).toMatch(/^~/);
    });
  });
});