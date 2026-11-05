import { describe, it, expect } from "vitest";
import {
  buildArguments,
  buildAudioArguments,
  NO_SOUND_MESSAGE,
  buildGifArguments,
  buildFrameArguments,
  outputDurationArgs,
  expectedOutputSeconds,
  withSafeTimes,
  assertFiniteArgs,
  buildAudioFilter,
  resolveThreadCount,
  MT_THREAD_CAP,
  UNKNOWN_CORES_THREADS,
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

  it("is min(4, hardwareConcurrency || 2)", () => {
    expect(resolveThreadCount("multi", 2)).toBe(2);
    expect(resolveThreadCount("multi", 1)).toBe(1);
    expect(resolveThreadCount("multi", 3)).toBe(3);
    expect(UNKNOWN_CORES_THREADS).toBe(2);
    expect(resolveThreadCount("multi", 0)).toBe(2);
    expect(resolveThreadCount("multi", undefined)).toBe(2);
    expect(resolveThreadCount("multi", NaN)).toBe(2);
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

describe("soundtrack", () => {
  const track = (o: Partial<{ musicVolume: number; originalAudioVolume: number; loopMusic: boolean; replaceAudio: boolean }> = {}) => ({
    inputName: "music.mp3",
    options: { file: null, musicVolume: 80, originalAudioVolume: 40, loopMusic: false, replaceAudio: true, ...o },
  });

  it("replaces the video's sound with the track at its volume", () => {
    const args = buildArguments(opts({ music: track() }));
    const graph = valuesOf(args, "-filter_complex")[0]!;
    expect(graph).toContain("[1:a]volume=0.80[aout]");
    expect(graph).not.toContain("[0:a]");
    expect(graph).not.toContain("amix");
    expect(valuesOf(args, "-map")).toEqual(["[vbase]", "[aout]"]);
  });

  it("mixes when not replacing, with both volumes", () => {
    const graph = valuesOf(buildArguments(opts({ music: track({ replaceAudio: false }) })), "-filter_complex")[0]!;
    expect(graph).toContain("[0:a]volume=0.40[orig]");
    expect(graph).toContain("[1:a]volume=0.80[music]");
    expect(graph).toContain("amix=inputs=2:duration=first");
  });
});

describe("buildAudioArguments (sound only)", () => {
  const audio = (o: Partial<Parameters<typeof buildAudioArguments>[0]> = {}) =>
    buildAudioArguments({
      recipe: recipe(),
      format: "mp3",
      inputName: "input.mp4",
      outputName: "out.mp3",
      videoDuration: 6,
      hasOriginalAudio: true,
      threads: 0,
      ...o,
    });

  it("exports MP3 at 192 kb/s with no video", () => {
    const args = audio();
    expect(args).toContain("-vn");
    expect(valuesOf(args, "-c:a")).toEqual(["libmp3lame"]);
    expect(valuesOf(args, "-b:a")).toEqual(["192k"]);
    expect(valuesOf(args, "-map")).toEqual(["0:a:0"]);
    expect(args).not.toContain("-c:v");
    expect(args.at(-1)).toBe("out.mp3");
  });

  it("exports WAV as 16-bit 48 kHz", () => {
    const args = audio({ format: "wav", outputName: "out.wav" });
    expect(valuesOf(args, "-c:a")).toEqual(["pcm_s16le"]);
    expect(valuesOf(args, "-ar")).toEqual(["48000"]);
  });

  it("applies the trim, speed, volume and loudness, and stops at the edit's length", () => {
    const args = audio({ recipe: recipe({ trimStart: 1, trimEnd: 5, speed: 2, volume: 150, normalizeAudio: true }) });
    const graph = valuesOf(args, "-filter_complex")[0]!;
    expect(graph).toBe("[0:a]atrim=start=1:end=5,asetpts=PTS-STARTPTS,atempo=2,volume=1.50,loudnorm=I=-14:TP=-1.5:LRA=11[aout]");
    expect(valuesOf(args, "-map")).toEqual(["[aout]"]);
    expect(valuesOf(args, "-t")).toEqual(["2.000000"]);
  });

  it("uses the soundtrack, looped and cut to the video's length", () => {
    const args = audio({
      music: { inputName: "music.mp3", options: { file: null, musicVolume: 100, originalAudioVolume: 40, loopMusic: true, replaceAudio: true } },
    });
    expect(args.slice(0, 6)).toEqual(["-i", "input.mp4", "-stream_loop", "-1", "-i", "music.mp3"]);
    expect(valuesOf(args, "-filter_complex")[0]).toBe("[1:a]volume=1.00[aout]");
    expect(valuesOf(args, "-t")).toEqual(["6.000000"]);
  });

  it("refuses when there is no sound at all", () => {
    expect(() => audio({ hasOriginalAudio: false })).toThrow(NO_SOUND_MESSAGE);
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

describe("time values never reach FFmpeg as Infinity or NaN", () => {
  const BAD = [Infinity, -Infinity, NaN];
  const music = {
    inputName: "music.mp3",
    options: { file: null, musicVolume: 50, originalAudioVolume: 100, loopMusic: true },
  } as unknown as ExportArgsOptions["music"];

  it("expectedOutputSeconds only returns finite, positive lengths", () => {
    expect(expectedOutputSeconds(recipe(), 10)).toBe(10);
    expect(expectedOutputSeconds(recipe({ trimStart: 2, trimEnd: 8, speed: 2 }), 10)).toBe(3);
    for (const bad of [...BAD, 0, -5]) {
      expect(expectedOutputSeconds(recipe(), bad)).toBeNull();
      expect(expectedOutputSeconds(recipe({ speed: bad }), 10)).toBeNull();
    }
    // A trim end still bounds the clip when the file's own duration is unknown.
    expect(expectedOutputSeconds(recipe({ trimEnd: 4 }), Infinity)).toBe(4);
  });

  it("omits -t when the duration is unknown, at any speed", () => {
    for (const bad of [...BAD, 0]) {
      for (const speed of [0.5, 1, 2]) {
        expect(outputDurationArgs(recipe({ speed }), bad)).toEqual([]);
        expect(buildArguments(opts({ recipe: recipe({ speed }), videoDuration: bad }))).not.toContain("-t");
      }
    }
  });

  it("stops looped music at the end of the video when there's no -t", () => {
    const args = buildArguments(opts({ videoDuration: Infinity, music }));
    expect(args).toContain("-stream_loop");
    expect(args).toContain("-shortest");
    expect(args).not.toContain("-t");
    // With a known length, -t bounds it instead.
    expect(buildArguments(opts({ videoDuration: 6, music }))).not.toContain("-shortest");
  });

  it("repairs invalid trim and speed values instead of passing them on", () => {
    const fixed = withSafeTimes(recipe({ trimStart: NaN, trimEnd: Infinity, speed: Infinity }));
    expect(fixed).toMatchObject({ trimStart: 0, trimEnd: null, speed: 1 });
    expect(withSafeTimes(recipe({ trimStart: 5, trimEnd: 3 })).trimEnd).toBeNull();
    const ok = recipe({ trimStart: 1, trimEnd: 4, speed: 1.5 });
    expect(withSafeTimes(ok)).toBe(ok);
  });

  it("an infinite speed doesn't hang the audio filter builder", () => {
    expect(buildAudioFilter(recipe({ speed: Infinity }))).not.toMatch(/Infinity|NaN/);
    expect(buildAudioFilter(recipe({ speed: NaN }))).not.toMatch(/Infinity|NaN/);
  });

  it("no combination of bad values produces a non-finite argument", () => {
    const values = [...BAD, 0, -1, 2.5];
    const failures: string[] = [];
    for (const trimStart of values)
      for (const trimEnd of [...values, null])
        for (const speed of values)
          for (const videoDuration of values) {
            const r = recipe({ trimStart, trimEnd, speed });
            const all = [
              ...buildArguments(opts({ recipe: r, videoDuration })),
              ...buildArguments(opts({ recipe: r, videoDuration, format: "webm", music })),
              ...Object.values(
                buildGifArguments({
                  recipe: r,
                  inputName: "in.mp4",
                  paletteName: "p.png",
                  outputName: "out.gif",
                  targetW: 480,
                  targetH: 270,
                  videoDuration,
                  threads: 4,
                })
              ).flat(),
            ];
            const bad = all.find((arg) => /Infinity|NaN/.test(arg));
            if (bad) failures.push(`${JSON.stringify({ trimStart, trimEnd, speed, videoDuration })}: ${bad}`);
          }
    expect(failures).toEqual([]);
  });

  it("assertFiniteArgs rejects a non-finite argument with a clear error", () => {
    expect(() => assertFiniteArgs(["-t", "Infinity"])).toThrow(/time value is not a number/);
    expect(() => assertFiniteArgs(["-vf", "trim=start=NaN"])).toThrow();
    // Words that merely contain the letters are fine.
    expect(assertFiniteArgs(["-i", "Nanaimo.mp4", "-metadata", "title=Infinityband"])).toHaveLength(4);
  });
});

describe("buildFrameArguments", () => {
  it("seeks before the input and writes one scaled JPEG", () => {
    const args = buildFrameArguments({ inputPath: "/frames-src/source.mp4", time: 2.5, outputName: "f.jpg", width: 160, threads: 1 });
    expect(args.slice(0, 2)).toEqual(["-ss", "2.500"]);
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args.join(" ")).toContain("-frames:v 1");
    expect(args.join(" ")).toContain("scale=160:-2");
    expect(args.at(-1)).toBe("f.jpg");
    expect(args.flatMap((a, i) => (a === "-threads" ? [args[i + 1]] : []))).toEqual(["1", "1"]);
  });

  it("keeps the width even and never seeks to a non-finite time", () => {
    const args = buildFrameArguments({ inputPath: "in.mp4", time: Number.NaN, outputName: "f.jpg", width: 161, threads: 0 });
    expect(args.slice(0, 2)).toEqual(["-ss", "0.000"]);
    expect(args.join(" ")).toContain("scale=162:-2");
    expect(args).not.toContain("-threads");
  });
});
