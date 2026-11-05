import { describe, it, expect } from "vitest";
import {
  MIN_CROP,
  clampCrop,
  cropFilter,
  cropForAspect,
  cropPixels,
  dragCrop,
  isFullFrame,
  isValidCrop,
  type CropRect,
} from "../crop";
import { buildVideoFilter } from "../ffmpegArgs";
import { outputFrame } from "../framing";
import { isValidRecipe } from "../types";
import { toolsUsed } from "../featureTelemetry";
import { DEFAULT_RECIPE } from "../constants";

const inside = (c: CropRect) =>
  c.x >= 0 && c.y >= 0 && c.x + c.width <= 1 + 1e-9 && c.y + c.height <= 1 + 1e-9 && c.width >= MIN_CROP && c.height >= MIN_CROP;

describe("crop rectangle", () => {
  it("treats a missing or whole-frame crop as no crop", () => {
    expect(isFullFrame(null)).toBe(true);
    expect(isFullFrame(undefined)).toBe(true);
    expect(isFullFrame({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(isFullFrame({ x: 0.1, y: 0, width: 0.9, height: 1 })).toBe(false);
    expect(cropFilter(null)).toBeNull();
    expect(cropFilter({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it("clamps into the frame with a minimum size", () => {
    expect(clampCrop({ x: 0.9, y: -1, width: 0.5, height: 0.01 })).toEqual({ x: 0.5, y: 0, width: 0.5, height: MIN_CROP });
    expect(inside(clampCrop({ x: Number.NaN, y: 2, width: 3, height: -1 }))).toBe(true);
  });

  it("fits the largest box of an aspect, centred", () => {
    // 1:1 in a 16:9 source: full height, 9/16 of the width.
    expect(cropForAspect(1, 16 / 9)).toEqual({ x: 0.2188, y: 0, width: 0.5625, height: 1 });
    // 16:9 in a 9:16 source: full width.
    const wide = cropForAspect(16 / 9, 9 / 16);
    expect(wide.width).toBe(1);
    expect(wide.height).toBeCloseTo(0.3164, 3);
    // Centred on an existing crop, but still inside the frame.
    expect(inside(cropForAspect(1, 16 / 9, { x: 0.9, y: 0, width: 0.1, height: 1 }))).toBe(true);
  });

  it("moves without resizing and stays in the frame", () => {
    const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
    expect(dragCrop(start, "move", 0.1, -0.05, null, 16 / 9)).toEqual({ x: 0.3, y: 0.15, width: 0.5, height: 0.5 });
    expect(dragCrop(start, "move", 5, 5, null, 16 / 9)).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it("resizes from an edge or corner, keeping the opposite side", () => {
    const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
    expect(dragCrop(start, "e", 0.1, 0, null, 16 / 9)).toEqual({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 });
    expect(dragCrop(start, "nw", -0.1, -0.1, null, 16 / 9)).toEqual({ x: 0.1, y: 0.1, width: 0.6, height: 0.6 });
    // Never smaller than the minimum, never inverted.
    expect(dragCrop(start, "w", 2, 0, null, 16 / 9).width).toBe(MIN_CROP);
  });

  it("keeps the aspect while resizing when one is chosen", () => {
    const source = 16 / 9;
    const start = cropForAspect(1, source);
    for (const [handle, dx, dy] of [["se", -0.1, 0], ["e", -0.2, 0], ["n", 0, 0.3], ["nw", 0.05, 0.05], ["se", 0.5, 0.5]] as const) {
      const next = dragCrop(start, handle, dx, dy, 1, source);
      expect(inside(next)).toBe(true);
      expect((next.width * source) / next.height).toBeCloseTo(1, 1);
    }
  });

  it("reports even pixel sizes, as FFmpeg produces", () => {
    expect(cropPixels({ x: 0, y: 0, width: 0.5, height: 0.333 }, 1921, 1080)).toEqual({ width: 960, height: 358 });
  });

  it("validates stored crops", () => {
    expect(isValidCrop(null)).toBe(true);
    expect(isValidCrop(undefined)).toBe(true);
    expect(isValidCrop({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })).toBe(true);
    expect(isValidCrop({ x: 0.6, y: 0, width: 0.5, height: 0.5 })).toBe(false);
    expect(isValidCrop({ x: 0, y: 0, width: 0.01, height: 0.5 })).toBe(false);
    expect(isValidCrop({ x: "0", y: 0, width: 1, height: 1 })).toBe(false);
    expect(isValidCrop("crop")).toBe(false);
    expect(isValidRecipe({ ...DEFAULT_RECIPE, crop: { x: 0, y: 0, width: 2, height: 1 } })).toBe(false);
    expect(isValidRecipe({ ...DEFAULT_RECIPE, crop: { x: 0, y: 0, width: 0.5, height: 1 } })).toBe(true);
    // Recipes saved before the crop tool have no crop field.
    expect(isValidRecipe(DEFAULT_RECIPE)).toBe(true);
  });
});

describe("crop in the export", () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };

  it("crops first, with even sizes, before rotation and scaling", () => {
    const vf = buildVideoFilter({ ...DEFAULT_RECIPE, crop, rotate: 90, trimStart: 1, trimEnd: 3 }, 1080, 1920);
    const parts = vf.split(",");
    const cropAt = parts.findIndex((p) => p.startsWith("crop=trunc"));
    expect(parts[cropAt]).toBe("crop=trunc(iw*0.5/2)*2:trunc(ih*0.6/2)*2:trunc(iw*0.1):trunc(ih*0.2)");
    expect(cropAt).toBeGreaterThan(parts.findIndex((p) => p.startsWith("trim=")));
    expect(cropAt).toBeLessThan(parts.indexOf("transpose=1"));
    expect(cropAt).toBeLessThan(parts.findIndex((p) => p.startsWith("scale=")));
  });

  it("adds nothing without a crop", () => {
    expect(buildVideoFilter(DEFAULT_RECIPE, 1080, 1920)).not.toContain("crop=trunc");
  });

  it("counts as a tool used", () => {
    expect(toolsUsed({ ...DEFAULT_RECIPE, crop })).toContain("crop");
    expect(toolsUsed(DEFAULT_RECIPE)).not.toContain("crop");
  });

  it("the Fill guide sits inside the crop", () => {
    // Square output, 16:9 source, crop the left half (taller than square):
    // the guide spans the left half's full width, trimmed top and bottom.
    const frame = outputFrame({ preset: "square-1-1", customWidth: 0, customHeight: 0, framing: "fill", crop: { x: 0, y: 0, width: 0.5, height: 1 } }, 16 / 9);
    expect(parseFloat(frame.left)).toBeCloseTo(0, 3);
    expect(parseFloat(frame.right)).toBeCloseTo(50, 3);
    expect(parseFloat(frame.top)).toBeGreaterThan(0);
    expect(frame.top).toBe(frame.bottom);
    const uncropped = outputFrame({ preset: "square-1-1", customWidth: 0, customHeight: 0, framing: "fill" }, 16 / 9);
    expect(uncropped.left).toBe(uncropped.right);
  });
});
