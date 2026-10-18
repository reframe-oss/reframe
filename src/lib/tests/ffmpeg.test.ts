import { describe, it, expect } from "vitest";
import { buildAudioFilter, buildArguments } from "../ffmpeg";
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

describe("buildArguments background music and keepAudio handling", () => {
  const baseRecipe: EditRecipe = {
    preset: "1080p",
    customWidth: 1920,
    customHeight: 1080,
    quality: 23,
    speed: 1,
    trimStart: 0,
    trimEnd: null,
    format: "mp4",
    keepAudio: true,
    stabilization: false,
    soundOnCompletion: false,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    framing: "fit",
    rotation: 0,
    volume: 100,
  };

  const musicOptions = {
    file: null,
    musicVolume: 80,
    originalAudioVolume: 50,
    loopMusic: true,
  };

  it("includes background music as sole audio track when keepAudio is false", () => {
    const recipe: EditRecipe = { ...baseRecipe, keepAudio: false };
    const args = buildArguments(
      recipe,
      "mp4",
      "output.mp4",
      "input.mp4",
      1920,
      1080,
      true, // hasMusicTrack
      "music.mp3",
      musicOptions,
      false, // hasOverlay
      "",
      undefined,
      true, // hasOriginalAudio
      60
    );

    // Should include music input and loop option
    expect(args).toContain("-i");
    expect(args).toContain("music.mp3");
    expect(args).toContain("-stream_loop");

    // Filter complex should format music volume to [aout] without mixing [orig]
    const filterComplexIndex = args.indexOf("-filter_complex");
    expect(filterComplexIndex).toBeGreaterThan(-1);
    const filterComplex = args[filterComplexIndex + 1];
    expect(filterComplex).toContain("[1:a]volume=0.80[aout]");
    expect(filterComplex).not.toContain("amix");

    // Output should map [aout] and include audio codec (not -an)
    expect(args).toContain("-map");
    expect(args).toContain("[aout]");
    expect(args).not.toContain("-an");
    expect(args).toContain("-c:a");
  });

  it("mixes original audio and background music when keepAudio is true", () => {
    const recipe: EditRecipe = { ...baseRecipe, keepAudio: true };
    const args = buildArguments(
      recipe,
      "mp4",
      "output.mp4",
      "input.mp4",
      1920,
      1080,
      true, // hasMusicTrack
      "music.mp3",
      musicOptions,
      false, // hasOverlay
      "",
      undefined,
      true, // hasOriginalAudio
      60
    );

    const filterComplexIndex = args.indexOf("-filter_complex");
    expect(filterComplexIndex).toBeGreaterThan(-1);
    const filterComplex = args[filterComplexIndex + 1];
    expect(filterComplex).toContain("volume=0.50[orig]");
    expect(filterComplex).toContain("[1:a]volume=0.80[music]");
    expect(filterComplex).toContain("[orig][music]amix=inputs=2:duration=first:dropout_transition=0[aout]");
    expect(args).toContain("-map");
    expect(args).toContain("[aout]");
    expect(args).not.toContain("-an");
  });

  it("mutes audio completely with -an when keepAudio is false and there is no background music", () => {
    const recipe: EditRecipe = { ...baseRecipe, keepAudio: false };
    const args = buildArguments(
      recipe,
      "mp4",
      "output.mp4",
      "input.mp4",
      1920,
      1080,
      false, // hasMusicTrack
      "",
      undefined,
      false, // hasOverlay
      "",
      undefined,
      true, // hasOriginalAudio
      60
    );

    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
  });
});

