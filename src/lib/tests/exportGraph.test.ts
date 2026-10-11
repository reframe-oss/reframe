import { describe, it, expect } from "vitest";
import {
  buildArguments,
  buildAudioFilter,
  buildAudioTrimFilter,
  buildDurationArgs,
  buildVideoFilter,
} from "../exportGraph";
import { DEFAULT_RECIPE } from "../constants";
import { BackgroundMusicOptions, EditRecipe, ImageOverlayOptions } from "../types";

const MUSIC: BackgroundMusicOptions = {
  file: null,
  musicVolume: 70,
  originalAudioVolume: 100,
  loopMusic: false,
};

const OVERLAY: ImageOverlayOptions = {
  file: null,
  position: "bottom-right",
  size: 200,
  opacity: 100,
};

interface ArgsOverrides {
  recipe?: Partial<EditRecipe>;
  format?: "mp4" | "webm" | "mkv" | "gif";
  hasMusicTrack?: boolean;
  musicOptions?: BackgroundMusicOptions;
  hasOverlay?: boolean;
  overlayOptions?: ImageOverlayOptions;
  hasOriginalAudio?: boolean;
  videoDuration?: number;
}

/** The worker's call shape: one recipe, every branch flag overridable. */
function build(overrides: ArgsOverrides = {}): string[] {
  const recipe = { ...DEFAULT_RECIPE, ...(overrides.recipe ?? {}) } as EditRecipe;
  return buildArguments(
    recipe,
    overrides.format ?? "mp4",
    "output.mp4",
    "input.mp4",
    1080,
    1920,
    overrides.hasMusicTrack ?? false,
    "music_input.mp3",
    overrides.musicOptions,
    overrides.hasOverlay ?? false,
    "overlay.png",
    overrides.overlayOptions,
    overrides.hasOriginalAudio ?? true,
    overrides.videoDuration ?? 10
  );
}

function valueAfter(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
}

function filterComplex(args: string[]): string {
  return valueAfter(args, "-filter_complex") ?? "";
}

const recipe = (patch: Partial<EditRecipe>) => ({ ...DEFAULT_RECIPE, ...patch } as EditRecipe);

describe("export graph: video filters", () => {
  it("applies the Sharpness setting with unsharp", () => {
    expect(buildVideoFilter(recipe({ sharpness: 2 }), 1080, 1920)).toContain("unsharp=5:5:2:5:5:0.0");
  });

  it("omits unsharp when sharpness is at its default", () => {
    expect(buildVideoFilter(recipe({ sharpness: 0 }), 1080, 1920)).not.toContain("unsharp");
  });

  it("trims to the end of the stream without a placeholder bound", () => {
    const filter = buildVideoFilter(recipe({ trimStart: 5 }), 1080, 1920);
    expect(filter).toContain("trim=start=5");
    expect(filter).not.toContain("999999");
  });
});

describe("export graph: audio filters", () => {
  it("applies the Volume setting to the original audio", () => {
    expect(buildAudioFilter(recipe({ volume: 50 }))).toBe("volume=0.50");
    expect(buildAudioFilter(recipe({ volume: 200 }))).toBe("volume=2.00");
    expect(buildAudioFilter(recipe({ volume: 0 }))).toBe("volume=0.00");
  });

  it("leaves the chain untouched at the default volume", () => {
    expect(buildAudioFilter(recipe({ volume: 100 }))).toBe("");
  });

  it("combines speed and volume", () => {
    expect(buildAudioFilter(recipe({ speed: 2, volume: 200 }))).toBe("atempo=2,volume=2.00");
  });

  it("keeps normalization after the manual volume", () => {
    expect(buildAudioFilter(recipe({ volume: 50, normalizeAudio: true }))).toBe(
      "volume=0.50,loudnorm=I=-14:TP=-1.5:LRA=11"
    );
  });

  it("trims audio without a placeholder bound", () => {
    expect(buildAudioTrimFilter(recipe({}))).toBe("");
    expect(buildAudioTrimFilter(recipe({ trimStart: 5 }))).toBe("atrim=start=5,asetpts=PTS-STARTPTS");
    expect(buildAudioTrimFilter(recipe({ trimStart: 2, trimEnd: 8 }))).toBe(
      "atrim=start=2:end=8,asetpts=PTS-STARTPTS"
    );
  });
});

describe("export graph: duration arguments", () => {
  it("rejects durations that cannot be trusted", () => {
    expect(buildDurationArgs(recipe({}), 0)).toEqual([]);
    expect(buildDurationArgs(recipe({}), Infinity)).toEqual([]);
    expect(buildDurationArgs(recipe({}), NaN)).toEqual([]);
  });

  it("divides the trimmed range by the playback speed", () => {
    expect(buildDurationArgs(recipe({}), 12)).toEqual(["-t", "12.000000"]);
    expect(buildDurationArgs(recipe({ trimStart: 2, trimEnd: 8, speed: 2 }), 30)).toEqual(["-t", "3.000000"]);
  });
});

describe("export graph: output argv", () => {
  it("passes the volume setting through to the encoded audio", () => {
    expect(valueAfter(build({ recipe: { volume: 50 } }), "-af")).toBe("volume=0.50");
  });

  it("adds no audio filter at the default volume", () => {
    expect(build()).not.toContain("-af");
  });

  it("caps the output at the video duration", () => {
    expect(valueAfter(build({ videoDuration: 10 }), "-t")).toBe("10.000000");
  });

  it("caps trimmed and sped-up output at the expected duration", () => {
    const args = build({ recipe: { trimStart: 2, trimEnd: 8, speed: 2 }, videoDuration: 30 });
    expect(valueAfter(args, "-t")).toBe("3.000000");
    expect(valueAfter(args, "-vf")).toContain("trim=start=2:end=8");
    expect(args[args.length - 1]).toBe("output.mp4");
  });

  it("omits -t when the duration cannot be trusted", () => {
    // 0 = metadata failed to load, Infinity = container reports no duration
    // (MediaRecorder WebM). `-t Infinity` aborts the export outright.
    expect(build({ videoDuration: 0 })).not.toContain("-t");
    expect(build({ videoDuration: Infinity })).not.toContain("-t");
    expect(build({ videoDuration: NaN })).not.toContain("-t");
  });

  it("caps the duration from an explicit trim even when the total is unknown", () => {
    const args = build({ recipe: { trimStart: 1, trimEnd: 6 }, videoDuration: Infinity });
    expect(valueAfter(args, "-t")).toBe("5.000000");
  });

  it("caps a looped music export so it cannot outrun the video (#1493)", () => {
    const args = build({
      hasMusicTrack: true,
      musicOptions: { ...MUSIC, loopMusic: true },
      hasOriginalAudio: false,
      videoDuration: 10,
    });
    expect(valueAfter(args, "-stream_loop")).toBe("-1");
    expect(filterComplex(args)).toContain("[1:a]volume=0.70[aout]");
    expect(valueAfter(args, "-t")).toBe("10.000000");
  });

  it("mixes original audio and music at their configured volumes", () => {
    const args = build({
      hasMusicTrack: true,
      musicOptions: { ...MUSIC, originalAudioVolume: 40 },
    });
    const graph = filterComplex(args);
    expect(graph).toContain("[0:a]volume=0.40[orig]");
    expect(graph).toContain("[1:a]volume=0.70[music]");
    expect(graph).toContain("amix=inputs=2:duration=first:dropout_transition=0[aout]");
    expect(valueAfter(args, "-map")).toBe("[vbase]");
  });

  it("drops audio entirely when the recipe is muted", () => {
    const args = build({ recipe: { keepAudio: false } });
    expect(args).toContain("-an");
    expect(args).not.toContain("-af");
    expect(args).not.toContain("-c:a");
  });

  it("drops audio when the source is silent and no music is attached", () => {
    const args = build({ hasOriginalAudio: false });
    expect(args).toContain("-an");
    expect(args).not.toContain("-af");
  });

  it("keeps valid overlay positioning variables", () => {
    const graph = filterComplex(build({ hasOverlay: true, overlayOptions: OVERLAY }));
    expect(graph).toContain("overlay=W-w-20:H-h-20");
    expect(graph).not.toContain("main_w");
  });

  it("uses the audio codec that matches the container", () => {
    expect(valueAfter(build({ format: "webm" }), "-c:a")).toBe("libopus");
    expect(valueAfter(build({ format: "mkv" }), "-c:a")).toBe("aac");
    expect(valueAfter(build({ format: "mp4" }), "-c:a")).toBe("aac");
  });
});
