import { EditRecipe, BackgroundMusicOptions, ImageOverlayOptions, OverlayPosition } from "./types";
import { buildTextFilter } from "./text-overlay";
import { cropFilter } from "./crop";
import { getPresetById } from "./presets";

// The FFmpeg command line for every export is built here and only here.
// ffmpeg.worker.ts runs these commands; ffmpeg.ts re-exports the filter
// builders for tests. There used to be a second copy in ffmpeg.ts that tests
// exercised while the worker ran its own — sharpness, volume and the `-t` fix
// all landed in the copy that never ran. Keep this module free of DOM/worker
// APIs so it can be imported from both sides.

export type OutputFormat = "mp4" | "webm" | "mkv" | "gif";
export type EngineMode = "multi" | "single";

/**
 * The pixel size an export is encoded at: the preset's size, or the custom
 * size, rounded to even numbers (H.264/VP8 with 4:2:0 chroma need them). The
 * worker, the UI and tests all use this, so what the editor shows is what
 * FFmpeg is told.
 */
export function resolveOutputSize(recipe: Pick<EditRecipe, "preset" | "customWidth" | "customHeight">): { width: number; height: number } {
  let width: number;
  let height: number;
  if (recipe.preset === "custom") {
    width = recipe.customWidth;
    height = recipe.customHeight;
  } else {
    const preset = getPresetById(recipe.preset);
    width = preset?.width ?? 1920;
    height = preset?.height ?? 1080;
  }
  return { width: Math.round(width / 2) * 2, height: Math.round(height / 2) * 2 };
}

/**
 * Upper bound on threads per FFmpeg stage (decode, filter, encode) for the
 * multi-threaded core. @ffmpeg/core-mt pre-spawns a pool of 32 pthread
 * workers; a thread beyond the pool needs the FFmpeg worker's event loop to
 * start, but that loop is blocked inside `exec`, so the run deadlocks at 0%.
 * With "auto" threading x264/libvpx and the decoder each size themselves from
 * the CPU count and together exceed the pool on many-core machines. Measured
 * on an 11-core M3 Pro (Chrome 155): auto hung, 4 completed ~4× faster than
 * the single-threaded core.
 */
export const MT_THREAD_CAP = 4;

/** Threads to assume when the browser doesn't report its core count. */
export const UNKNOWN_CORES_THREADS = 2;

/**
 * Threads to request per stage: min(MT_THREAD_CAP, hardwareConcurrency || 2),
 * or 0 ("don't pass any thread flags") for the single-threaded core.
 */
export function resolveThreadCount(mode: EngineMode, hardwareConcurrency?: number): number {
  if (mode !== "multi") return 0;
  const cores =
    hardwareConcurrency && Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0
      ? Math.floor(hardwareConcurrency)
      : UNKNOWN_CORES_THREADS;
  return Math.max(1, Math.min(MT_THREAD_CAP, cores));
}

/** Decoder thread flag, placed before an `-i`. */
function inputThreadArgs(threads: number): string[] {
  return threads > 0 ? ["-threads", String(threads)] : [];
}

/** Encoder and filter-graph thread flags, placed before the output name. */
function outputThreadArgs(threads: number, hasFilterComplex: boolean): string[] {
  if (threads <= 0) return [];
  const args = ["-threads", String(threads), "-filter_threads", String(threads)];
  if (hasFilterComplex) args.push("-filter_complex_threads", String(threads));
  return args;
}

/**
 * Explicit output duration. Stops encoder flush overshoot and, with looped
 * background music (`-stream_loop -1`) on a silent video, an export that
 * never ends. Omitted when the duration is unknown (metadata read failed, or
 * a live-recorded file whose header has none): `-t 0` would produce an empty
 * file, and `-t Infinity` / `-t NaN` are invalid.
 */
export function outputDurationArgs(recipe: EditRecipe, videoDuration: number): string[] {
  const seconds = expectedOutputSeconds(recipe, videoDuration);
  return seconds === null ? [] : ["-t", seconds.toFixed(6)];
}

/** A usable duration in seconds: finite and positive. */
export function isUsableDuration(seconds: unknown): seconds is number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0;
}

/**
 * Length of the exported video in seconds, or null when it can't be known
 * (no usable source duration and no trim end, or an invalid speed).
 */
export function expectedOutputSeconds(recipe: EditRecipe, videoDuration: number): number | null {
  if (!isUsableDuration(recipe.speed)) return null;
  const end = recipe.trimEnd ?? videoDuration;
  if (!isUsableDuration(end)) return null;
  const start = Number.isFinite(recipe.trimStart) && recipe.trimStart > 0 ? recipe.trimStart : 0;
  const seconds = (end - start) / recipe.speed;
  return isUsableDuration(seconds) ? seconds : null;
}

/**
 * The recipe with every time value FFmpeg will see made valid: a non-finite
 * or negative trim start becomes 0, a trim end that isn't finite or isn't
 * after the start becomes "to the end of the stream", and an unusable speed
 * becomes 1. The editor shouldn't produce these, but a bad value would
 * otherwise reach FFmpeg as "Infinity" or "NaN".
 */
export function withSafeTimes(recipe: EditRecipe): EditRecipe {
  const trimStart = Number.isFinite(recipe.trimStart) && recipe.trimStart > 0 ? recipe.trimStart : 0;
  const trimEnd =
    recipe.trimEnd !== null && Number.isFinite(recipe.trimEnd) && recipe.trimEnd > trimStart
      ? recipe.trimEnd
      : null;
  const speed = isUsableDuration(recipe.speed) ? recipe.speed : 1;
  if (trimStart === recipe.trimStart && trimEnd === recipe.trimEnd && speed === recipe.speed) return recipe;
  return { ...recipe, trimStart, trimEnd, speed };
}

/** Throws if any argument carries a non-finite number. Last line of defence. */
export function assertFiniteArgs(args: string[]): string[] {
  const bad = args.find((arg) => /(^|[^a-z])(-?Infinity|NaN)([^a-z]|$)/.test(arg));
  if (bad !== undefined) {
    throw new Error(`Invalid export settings: a time value is not a number (${bad.slice(0, 80)})`);
  }
  return args;
}

export function buildVideoFilter(input: EditRecipe, targetW: number, targetH: number): string {
  const recipe = withSafeTimes(input);
  const filters: string[] = [];

  if (recipe.trimStart > 0 || recipe.trimEnd !== null) {
    // Precise bounds only; an open end lets FFmpeg infer it instead of a
    // large placeholder that makes it scan the whole file.
    if (recipe.trimEnd !== null) {
      filters.push(`trim=start=${recipe.trimStart}:end=${recipe.trimEnd}`);
    } else if (recipe.trimStart > 0) {
      filters.push(`trim=start=${recipe.trimStart}`);
    }
  }

  // The crop is drawn on the unrotated preview, so it applies before rotation.
  const crop = cropFilter(recipe.crop);
  if (crop) filters.push(crop);

  if (recipe.stabilization) {
    filters.push("deshake");
  }

  if (recipe.rotate === 90) {
    filters.push("transpose=1");
  } else if (recipe.rotate === 180) {
    filters.push("transpose=1,transpose=1");
  } else if (recipe.rotate === 270) {
    filters.push("transpose=2");
  }

  if (recipe.framing === "fit") {
    filters.push(
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease`,
      `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black`
    );
  } else {
    filters.push(
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase`,
      `crop=${targetW}:${targetH}`
    );
  }
  if (recipe.sharpness !== 0) {
    filters.push(`unsharp=5:5:${recipe.sharpness}:5:5:0.0`);
  }

  // Normalize timestamps only when needed — trim or speed change both
  // require a clean 0-based timeline to produce correct output duration.
  if (recipe.trimStart > 0 || recipe.trimEnd !== null || recipe.speed !== 1) {
    filters.push("setpts=PTS-STARTPTS");
  }

  if (recipe.speed !== 1) {
    const pts = (1 / recipe.speed).toFixed(4);
    filters.push(`setpts=${pts}*PTS`);
  }

  if (recipe.denoise) {
    filters.push("hqdn3d=1.5:1.5:6:6");
  }

  const needsEq =
    recipe.brightness !== 0 ||
    recipe.contrast !== 1 ||
    recipe.saturation !== 1;

  if (needsEq) {
    filters.push(
      `eq=brightness=${recipe.brightness}:contrast=${recipe.contrast}:saturation=${recipe.saturation}`
    );
  }

  const textOverlays = recipe.textOverlays || [];
  textOverlays.forEach((overlay) => {
    filters.push(buildTextFilter(overlay, targetW, targetH));
  });

  return filters.join(",");
}

export function buildAudioFilter(input: EditRecipe): string {
  const recipe = withSafeTimes(input);
  const filters: string[] = [];

  let remaining = recipe.speed;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }

  if (Math.abs(remaining - 1.0) > 0.001) {
    filters.push(`atempo=${Number(remaining.toFixed(4))}`);
  }

  if (recipe.volume !== undefined && recipe.volume !== 100) {
    filters.push(`volume=${(recipe.volume / 100).toFixed(2)}`);
  }

  if (recipe.normalizeAudio) filters.push("loudnorm=I=-14:TP=-1.5:LRA=11");

  return filters.join(",");
}

export function buildAudioTrimFilter(input: EditRecipe): string {
  const recipe = withSafeTimes(input);
  if (recipe.trimStart === 0 && recipe.trimEnd === null) return "";
  let trimFilter = `atrim=start=${recipe.trimStart}`;
  if (recipe.trimEnd !== null) {
    trimFilter += `:end=${recipe.trimEnd}`;
  }
  return `${trimFilter},asetpts=PTS-STARTPTS`;
}

const OVERLAY_POSITIONS: Record<OverlayPosition, string> = {
  "top-left": "20:20",
  "top-right": "W-w-20:20",
  "bottom-left": "20:H-h-20",
  "bottom-right": "W-w-20:H-h-20",
};

export interface ExportArgsOptions {
  recipe: EditRecipe;
  format: Exclude<OutputFormat, "gif">;
  inputName: string;
  outputName: string;
  targetW: number;
  targetH: number;
  videoDuration: number;
  hasOriginalAudio: boolean;
  music?: { inputName: string; options: BackgroundMusicOptions };
  overlay?: { inputName: string; options: ImageOverlayOptions };
  /** From resolveThreadCount; 0 for the single-threaded core. */
  threads: number;
}

export function buildArguments({
  recipe: input,
  format,
  inputName,
  outputName,
  targetW,
  targetH,
  videoDuration,
  hasOriginalAudio,
  music,
  overlay,
  threads,
}: ExportArgsOptions): string[] {
  const recipe = withSafeTimes(input);
  const vf = buildVideoFilter(recipe, targetW, targetH);
  const audioTrim = hasOriginalAudio ? buildAudioTrimFilter(recipe) : "";
  const audioSpeed = hasOriginalAudio ? buildAudioFilter(recipe) : "";
  const afParts = [audioTrim, audioSpeed].filter(Boolean);
  const af = afParts.join(",");

  const musicIdx = 1;
  const overlayIdx = music ? 2 : 1;

  const args: string[] = [];
  args.push(...inputThreadArgs(threads), "-i", inputName);
  if (music) {
    if (music.options.loopMusic) args.push("-stream_loop", "-1");
    args.push("-i", music.inputName);
  }
  if (overlay) {
    args.push("-i", overlay.inputName);
  }

  const needsFilterComplex = Boolean(overlay || music);
  const shouldKeepAudio = recipe.keepAudio && (hasOriginalAudio || Boolean(music));
  let usesFilterComplex = false;

  if (needsFilterComplex) {
    const filterParts: string[] = [];
    let videoOut = "[0:v]";

    if (vf) {
      filterParts.push(`[0:v]${vf}[vbase]`);
      videoOut = "[vbase]";
    }

    if (overlay) {
      const alpha = (overlay.options.opacity / 100).toFixed(2);
      filterParts.push(`[${overlayIdx}:v]scale=${overlay.options.size}:-2,format=rgba,colorchannelmixer=aa=${alpha}[logo]`);
      const pos = OVERLAY_POSITIONS[overlay.options.position] ?? OVERLAY_POSITIONS["bottom-right"];
      filterParts.push(`${videoOut}[logo]overlay=${pos}[vout]`);
      videoOut = "[vout]";
    }

    let audioOut = "";
    if (shouldKeepAudio) {
      if (music) {
        const musicVol = (music.options.musicVolume / 100).toFixed(2);
        if (hasOriginalAudio) {
          const origVol = (music.options.originalAudioVolume / 100).toFixed(2);
          const origChain = afParts.length > 0
            ? `[0:a]${af},volume=${origVol}[orig]`
            : `[0:a]volume=${origVol}[orig]`;
          filterParts.push(origChain);
          filterParts.push(`[${musicIdx}:a]volume=${musicVol}[music]`);
          filterParts.push(`[orig][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
          audioOut = "[aout]";
        } else {
          filterParts.push(`[${musicIdx}:a]volume=${musicVol}[aout]`);
          audioOut = "[aout]";
        }
      } else if (hasOriginalAudio && af) {
        filterParts.push(`[0:a]${af}[aout]`);
        audioOut = "[aout]";
      }
    }

    if (filterParts.length > 0) {
      args.push("-filter_complex", filterParts.join(";"));
      usesFilterComplex = true;
    }
    args.push("-map", videoOut === "[0:v]" ? "0:v" : videoOut);

    if (!shouldKeepAudio) {
      args.push("-an");
    } else if (audioOut) {
      args.push("-map", audioOut);
    } else if (hasOriginalAudio) {
      args.push("-map", "0:a");
    }
  } else {
    if (vf) args.push("-vf", vf);
    if (!shouldKeepAudio) {
      args.push("-an");
    } else if (af && hasOriginalAudio) {
      args.push("-af", af);
    }
  }

  if (format === "webm") {
    // VP8 + Vorbis, not VP9 + Opus: in @ffmpeg/core 0.12.10 the libvpx-vp9
    // and libopus encoders trap ("memory access out of bounds") on every
    // setting tried, and hang the multi-threaded core, so WebM exports could
    // never succeed. VP8's CRF mode needs a bitrate ceiling. Realtime
    // keeps WebM about as fast as MP4 (measured: 9 s vs 21–32 s with
    // "good" for a 6 s 1080p clip), as the old VP9 settings intended.
    args.push(
      "-c:v", "libvpx",
      "-crf", String(Math.min(63, Math.max(4, recipe.quality))),
      "-b:v", "8M",
      "-deadline", "realtime",
      "-cpu-used", "8"
    );
    if (shouldKeepAudio) args.push("-c:a", "libvorbis", "-q:a", "4");
  } else if (format === "mkv") {
    args.push("-c:v", "libx264", "-crf", String(recipe.quality), "-preset", "ultrafast");
    if (shouldKeepAudio) args.push("-c:a", "aac", "-b:a", "128k");
  } else {
    args.push("-c:v", "libx264", "-crf", String(recipe.quality), "-preset", "ultrafast", "-movflags", "+faststart");
    if (shouldKeepAudio) args.push("-c:a", "aac", "-b:a", "128k");
  }

  args.push(...outputThreadArgs(threads, usesFilterComplex));
  const durationArgs = outputDurationArgs(recipe, videoDuration);
  args.push(...durationArgs);
  // Without -t, looped music (-stream_loop -1) never ends: stop at the end
  // of the shortest stream, which is the video.
  if (durationArgs.length === 0 && music?.options.loopMusic) args.push("-shortest");
  args.push(outputName);
  return assertFiniteArgs(args);
}

export interface GifArgsOptions {
  recipe: EditRecipe;
  inputName: string;
  paletteName: string;
  outputName: string;
  targetW: number;
  targetH: number;
  videoDuration: number;
  threads: number;
}

/** Two-pass GIF: palettegen, then paletteuse. */
export function buildGifArguments({
  recipe: input,
  inputName,
  paletteName,
  outputName,
  targetW,
  targetH,
  videoDuration,
  threads,
}: GifArgsOptions): { palette: string[]; render: string[] } {
  const recipe = withSafeTimes(input);
  const vf = buildVideoFilter(recipe, targetW, targetH);
  const vfWithPalette = vf ? `${vf},palettegen` : "palettegen";
  const vfWithPaletteUse = vf ? `[0:v]${vf}[x];[x][1:v]paletteuse` : "[0:v][1:v]paletteuse";
  // The trim filter already bounds the clip; -t is only needed when speed
  // changes the output length.
  const durationArgs = recipe.speed !== 1 ? outputDurationArgs(recipe, videoDuration) : [];

  return {
    palette: assertFiniteArgs([
      ...inputThreadArgs(threads), "-i", inputName,
      "-vf", vfWithPalette,
      ...durationArgs, ...outputThreadArgs(threads, false),
      "-y", paletteName,
    ]),
    render: assertFiniteArgs([
      ...inputThreadArgs(threads), "-i", inputName, "-i", paletteName,
      "-lavfi", vfWithPaletteUse,
      ...durationArgs, ...outputThreadArgs(threads, true),
      "-y", outputName,
    ]),
  };
}

/**
 * One timeline frame: seek before the input (fast, from the nearest
 * keyframe), decode a single frame, scale it down and write a small JPEG.
 * Runs against the user's file mounted read-only (WORKERFS), so it is never
 * copied into memory.
 */
export function buildFrameArguments({
  inputPath,
  time,
  outputName,
  width,
  threads,
}: {
  inputPath: string;
  time: number;
  outputName: string;
  /** Output width in pixels; height keeps the aspect ratio. */
  width: number;
  threads: number;
}): string[] {
  const seconds = Number.isFinite(time) && time > 0 ? time : 0;
  return assertFiniteArgs([
    "-ss", seconds.toFixed(3),
    ...inputThreadArgs(threads), "-i", inputPath,
    "-frames:v", "1",
    "-an", "-sn",
    "-vf", `scale=${Math.max(16, Math.round(width / 2) * 2)}:-2`,
    "-q:v", "6",
    ...outputThreadArgs(threads, false),
    "-y", outputName,
  ]);
}
