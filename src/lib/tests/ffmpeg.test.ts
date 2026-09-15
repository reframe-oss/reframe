import { describe, it, expect } from "vitest";
import { buildAudioFilter } from "../ffmpeg";
import { EditRecipe } from "../types";

function build(speed: number, normalizeAudio: boolean): string {
  return buildAudioFilter({ speed, normalizeAudio, volume: 100 } as EditRecipe);
}

describe("buildAudioFilter", () => {
  it("should return an empty string for 1.0x speed", () => {
    expect(build(1, false)).toBe("");
  });

  it("should chain two 0.5x filters for 0.25x speed", () => {
    expect(build(0.25, false)).toBe("atempo=0.5,atempo=0.5");
  });

  it("should chain two 2.0x filters for 4.0x speed", () => {
    expect(build(4, false)).toBe("atempo=2.0,atempo=2");
  });

  it("should chain multiple 0.5x filters and a remainder for 0.1x speed", () => {
    expect(build(0.1, false)).toBe("atempo=0.5,atempo=0.5,atempo=0.5,atempo=0.8");
  });

  it("should chain multiple 2.0x filters and a remainder for 3.0x speed", () => {
    expect(build(3, false)).toBe("atempo=2.0,atempo=1.5");
  });

  it("should handle boundary values inside the 0.5x-2.0x range without chaining", () => {
    expect(build(0.5, false)).toBe("atempo=0.5");
    expect(build(2.0, false)).toBe("atempo=2");
    expect(build(1.5, false)).toBe("atempo=1.5");
    expect(build(0.75, false)).toBe("atempo=0.75");
  });

  it("should chain properly for very large speeds", () => {
    expect(build(10, false)).toBe("atempo=2.0,atempo=2.0,atempo=2.0,atempo=1.25");
  });

  it("should append loudnorm filter when normalizeAudio is true", () => {
    const result = build(1, true);
    expect(result).toContain("loudnorm");
  });

  it("should add volume filter when volume is not 100", () => {
    const result = buildAudioFilter({ speed: 1, normalizeAudio: false, volume: 150 } as EditRecipe);
    expect(result).toBe("volume=1.50");
  });
});
