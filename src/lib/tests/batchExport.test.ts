import { describe, it, expect } from "vitest";
import { batchOutputName, batchProgress, batchRecipe, isVideoFile, uniqueOutputNames } from "../batchExport";
import { DEFAULT_RECIPE } from "../constants";

describe("batch export helpers", () => {
  it("reuses the edit but resets the trim", () => {
    const recipe = { ...DEFAULT_RECIPE, trimStart: 3, trimEnd: 9, rotate: 90 as const, format: "webm" as const };
    expect(batchRecipe(recipe)).toEqual({ ...recipe, trimStart: 0, trimEnd: null });
  });

  it("names outputs after their inputs, safely", () => {
    expect(batchOutputName("Holiday clip.mov", "mp4")).toBe("Holiday clip-reframe.mp4");
    expect(batchOutputName("a/b:c?.webm", "gif")).toBe("a_b_c_-reframe.gif");
    expect(batchOutputName(".mp4", "mkv")).toBe(".mp4-reframe.mkv");
    expect(batchOutputName("noext", "webm")).toBe("noext-reframe.webm");
  });

  it("makes duplicate names unique, per output format", () => {
    expect(
      uniqueOutputNames([
        { name: "clip.mp4", format: "mp4" },
        { name: "clip.mov", format: "mp4" },
        { name: "CLIP.webm", format: "mp4" },
        { name: "clip.mp4", format: "gif" },
      ])
    ).toEqual(["clip-reframe.mp4", "clip-reframe (2).mp4", "CLIP-reframe (3).mp4", "clip-reframe.gif"]);
  });

  it("recognises videos by type or extension", () => {
    expect(isVideoFile({ type: "video/mp4", name: "x" })).toBe(true);
    expect(isVideoFile({ type: "", name: "screen.MOV" })).toBe(true);
    expect(isVideoFile({ type: "image/png", name: "photo.png" })).toBe(false);
  });

  it("averages progress over the batch, ignoring cancelled videos", () => {
    expect(batchProgress([])).toBe(0);
    expect(
      batchProgress([
        { status: "done", progress: 100 },
        { status: "exporting", progress: 50 },
        { status: "queued", progress: 0 },
        { status: "cancelled", progress: 0 },
      ])
    ).toBe(50);
  });
});
