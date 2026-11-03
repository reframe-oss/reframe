import { describe, it, expect } from "vitest";
import {
  buildArguments,
  buildGifArguments,
  outputDurationArgs,
  resolveThreadCount,
  MT_THREAD_CAP,
  type ExportArgsOptions,
} from "../ffmpegArgs";
import { DEFAULT_RECIPE } from "../constants";
import type { EditRecipe } from "../types";

const recipe = (overrides: Partial<EditRecipe> = {}): EditRecipe => ({ ...DEFAULT_RECIPE, ...overrides });

const opts = (overrides: Partial<ExportArgsOptions> = {}): ExportArgsOptions => ({
  recipe: recipe(),
  format: "mp4",
  inputName: "input.mp4",
  outputName: "output.mp4",
  targetW: 1280,
  targetH: 720,
  videoDuration: 6,
  hasOriginalAudio: true,
  threads: 0,
  ...overrides,
});

/** Value following `flag`, at every occurrence. */
const valuesOf = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

describe("resolveThreadCount", () => {
  it("never passes thread flags to the single-threaded core", () => {
    expect(resolveThreadCount("single", 16)).toBe(0);
    expect(resolveThreadCount("single")).toBe(0);
  });

  it("caps the multi-threaded core at MT_THREAD_CAP however many cores there are", () => {
    expect(MT_THREAD_CAP).toBe(4);
    expect(resolveThreadCount("multi", 11)).toBe(4);
    expect(resolveThreadCount("multi", 64)).toBe(4);
  });

  it("uses fewer threads on small devices and falls back to the cap when unknown", () => {
    expect(resolveThreadCount("multi", 2)).toBe(2);
    expect(resolveThreadCount("multi", 1)).toBe(1);
    expect(resolveThreadCount("multi", 0)).toBe(4);
    expect(resolveThreadCount("multi", undefined)).toBe(4);
    expect(resolveThreadCount("multi", NaN)).toBe(4);
  });
});

describe("buildArguments", () => {
  it("single-threaded: no -threads / -filter_threads anywhere", () => {
    const args = buildArguments(opts({ threads: 0 }));
    expect(args).not.toContain("-threads");
    expect(args).not.toContain("-filter_threads");
    expect(args).not.toContain("-filter_complex_threads");
  });

  it("multi-threaded: caps decoder, filter and encoder threads", () => {
    const args = buildArguments(opts({ threads: 4 }));
    // Decoder flag must precede -i to apply to the input.
    expect(args.indexOf("-threads")).toBeLessThan(args.indexOf("-i"));
    expect(valuesOf(args, "-threads")).toEqual(["4", "4"]);
    expect(valuesOf(args, "-filter_threads")).toEqual(["4"]);
    expect(args.at(-1)).toBe("output.mp4");
  });

  it("adds -filter_complex_threads only when a filter graph is used", () => {
    const withOverlay = buildArguments(
      opts({
        threads: 4,
        overlay: { inputName: "logo.png", options: { file: null, position: "top-left", size: 120, opacity: 80 } },
      })
    );
    expect(withOverlay).toContain("-filter_complex");
    expect(valuesOf(withOverlay, "-filter_complex_threads")).toEqual(["4"]);
    expect(buildArguments(opts({ threads: 4 }))).not.toContain("-filter_complex_threads");
  });

  it("applies sharpness and volume (these used to be dropped by the worker's copy)", () => {
    const args = buildArguments(opts({ recipe: recipe({ sharpness: 2, volume: 150 }) }));
    expect(valuesOf(args, "-vf")[0]).toContain("unsharp=5:5:2:5:5:0.0");
    expect(valuesOf(args, "-af")[0]).toContain("volume=1.50");
  });

  it("always bounds output duration when it is known, and omits it when not", () => {
    expect(valuesOf(buildArguments(opts()), "-t")).toEqual(["6.000000"]);
    expect(valuesOf(buildArguments(opts({ recipe: recipe({ trimStart: 1, trimEnd: 5, speed: 2 }) })), "-t")).toEqual([
      "2.000000",
    ]);
    expect(buildArguments(opts({ videoDuration: 0 }))).not.toContain("-t");
  });

  it("positions an image overlay inside the frame", () => {
    const args = buildArguments(
      opts({ overlay: { inputName: "logo.png", options: { file: null, position: "bottom-right", size: 100, opacity: 50 } } })
    );
    const graph = valuesOf(args, "-filter_complex")[0]!;
    expect(graph).toContain("overlay=W-w-20:H-h-20");
    expect(graph).toContain("colorchannelmixer=aa=0.50");
  });

  it("mixes background music with the original audio and loops it when asked", () => {
    const args = buildArguments(
      opts({
        music: { inputName: "music.mp3", options: { file: null, musicVolume: 50, originalAudioVolume: 100, loopMusic: true } },
      })
    );
    expect(args.slice(0, 6)).toEqual(["-i", "input.mp4", "-stream_loop", "-1", "-i", "music.mp3"]);
    expect(valuesOf(args, "-filter_complex")[0]).toContain("amix=inputs=2");
    expect(valuesOf(args, "-map")).toEqual(["[vbase]", "[aout]"]);
  });

  it("drops audio when the source has none", () => {
    expect(buildArguments(opts({ hasOriginalAudio: false }))).toContain("-an");
  });

  it("uses VP8/Vorbis for WebM (VP9 and Opus crash in @ffmpeg/core 0.12.10)", () => {
    const args = buildArguments(opts({ format: "webm", outputName: "out.webm" }));
    expect(valuesOf(args, "-c:v")).toEqual(["libvpx"]);
    expect(valuesOf(args, "-c:a")).toEqual(["libvorbis"]);
    expect(args).not.toContain("libvpx-vp9");
    expect(args).not.toContain("libopus");
    expect(valuesOf(args, "-b:v")).toEqual(["8M"]);
  });
});

describe("buildGifArguments", () => {
  const gif = (threads: number, overrides: Partial<EditRecipe> = {}) =>
    buildGifArguments({
      recipe: recipe({ format: "gif", ...overrides }),
      inputName: "in.mp4",
      paletteName: "palette.png",
      outputName: "out.gif",
      targetW: 480,
      targetH: 270,
      videoDuration: 6,
      threads,
    });

  it("runs palettegen then paletteuse", () => {
    const { palette, render } = gif(0);
    expect(valuesOf(palette, "-vf")[0]).toMatch(/palettegen$/);
    expect(valuesOf(render, "-lavfi")[0]).toMatch(/paletteuse$/);
    expect(palette).not.toContain("-threads");
  });

  it("caps threads in both passes on the multi-threaded core", () => {
    const { palette, render } = gif(4);
    expect(valuesOf(palette, "-threads")).toEqual(["4", "4"]);
    expect(valuesOf(render, "-threads")).toEqual(["4", "4"]);
    expect(valuesOf(render, "-filter_complex_threads")).toEqual(["4"]);
  });

  it("only adds -t when speed changes the length", () => {
    expect(gif(0).render).not.toContain("-t");
    expect(valuesOf(gif(0, { speed: 2 }).render, "-t")).toEqual(["3.000000"]);
  });
});

describe("outputDurationArgs", () => {
  it("guards against zero, negative and invalid durations", () => {
    expect(outputDurationArgs(recipe(), 0)).toEqual([]);
    expect(outputDurationArgs(recipe({ trimStart: 8 }), 6)).toEqual([]);
    expect(outputDurationArgs(recipe({ speed: 0 }), 6)).toEqual([]);
  });
});
