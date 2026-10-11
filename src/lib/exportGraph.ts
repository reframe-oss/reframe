import { EditRecipe, BackgroundMusicOptions, ImageOverlayOptions } from "./types";
import { buildTextFilter } from "./text-overlay";

/**
 * The FFmpeg filter graph and argv for one export.
 *
 * This lives outside `ffmpeg.worker.ts` so it is a single implementation that
 * both the worker and the unit tests execute — the export arguments used to be
 * duplicated (one copy here, one copy in `ffmpeg.ts` that nothing called), and
 * the copy that actually ran silently drifted behind it. Keep every export
 * graph decision in this file.
 *
 * Everything here is pure: no worker globals, no DOM, no FFmpeg instance.
 */

export function buildVideoFilter(recipe: EditRecipe, targetW: number, targetH: number): string {
  const filters: string[] = [];

  if (recipe.trimStart > 0 || recipe.trimEnd !== null) {
    // Only use trim filter with precise bounds to avoid scanning entire file.
    // If trimEnd is null, let FFmpeg infer the end instead of a large placeholder.
    if (recipe.trimEnd !== null) {
      filters.push(`trim=start=${recipe.trimStart}:end=${recipe.trimEnd}`);
    } else if (recipe.trimStart > 0) {
      filters.push(`trim=start=${recipe.trimStart}`);
    }
  }

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

export function buildAudioFilter(recipe: EditRecipe): string {
  if (recipe.speed <= 0) return "";
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

export function buildAudioTrimFilter(recipe: EditRecipe): string {
  if (recipe.trimStart === 0 && recipe.trimEnd === null) return "";

  // Avoid scanning entire audio with large placeholder values;
  // use precise trim bounds when available.
  let trimFilter = `atrim=start=${recipe.trimStart}`;
  if (recipe.trimEnd !== null) {
    trimFilter += `:end=${recipe.trimEnd}`;
  }
  // asetpts normalizes timestamps after trim for correct stream positioning
  return `${trimFilter},asetpts=PTS-STARTPTS`;
}

/**
 * Output duration cap, as FFmpeg arguments.
 *
 * Without `-t`, an audio input that outlasts the video decides when encoding
 * stops: a music track longer than the video extends the output, and looped
 * music (`-stream_loop -1`) on a video with no audio track never terminates.
 *
 * Returns no arguments when the source duration cannot be trusted —
 * `videoDuration` falls back to 0 when metadata fails to load, and containers
 * such as MediaRecorder WebM report no duration at all (`Infinity`). Either
 * value would otherwise reach FFmpeg as `-t 0` (a zero-length export) or
 * `-t Infinity` ("Invalid duration specification for t: Infinity").
 */
export function buildDurationArgs(recipe: EditRecipe, videoDuration: number): string[] {
  const sourceDuration = (recipe.trimEnd ?? videoDuration) - recipe.trimStart;
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  return ["-t", (sourceDuration / recipe.speed).toFixed(6)];
}

export function buildArguments(
  recipe: EditRecipe,
  format: "mp4" | "webm" | "mkv" | "gif",
  outputName: string,
  inputName: string,
  targetW: number,
  targetH: number,
  hasMusicTrack: boolean,
  musicInputName: string,
  musicOptions: BackgroundMusicOptions | undefined,
  hasOverlay: boolean,
  overlayInputName: string,
  overlayOptions: ImageOverlayOptions | undefined,
  hasOriginalAudio: boolean,
  videoDuration: number
): string[] {
  const vf = buildVideoFilter(recipe, targetW, targetH);
  const audioTrim = hasOriginalAudio ? buildAudioTrimFilter(recipe) : "";
  const audioSpeed = hasOriginalAudio ? buildAudioFilter(recipe) : "";
  const afParts = [audioTrim, audioSpeed].filter(Boolean);
  const af = afParts.join(",");

  const musicIdx = 1;
  const overlayIdx = hasMusicTrack ? 2 : 1;

  const args: string[] = [];
  args.push("-i", inputName);
  if (hasMusicTrack) {
    if (musicOptions!.loopMusic) args.push("-stream_loop", "-1");
    args.push("-i", musicInputName);
  }
  if (hasOverlay) {
    args.push("-i", overlayInputName);
  }

  const needsFilterComplex = hasOverlay || hasMusicTrack;
  const shouldKeepAudio = recipe.keepAudio && (hasOriginalAudio || hasMusicTrack);

  if (needsFilterComplex) {
    const filterParts: string[] = [];
    let videoOut = "[0:v]";

    if (vf) {
      filterParts.push(`[0:v]${vf}[vbase]`);
      videoOut = "[vbase]";
    }

    if (hasOverlay) {
      const scaledW = overlayOptions!.size;
      const alpha = (overlayOptions!.opacity / 100).toFixed(2);
      const posMap: Record<string, string> = {
        "top-left": "20:20",
        "top-right": "W-w-20:20",
        "bottom-left": "20:H-h-20",
        "bottom-right": "W-w-20:H-h-20",
      };

      interface PositionCoords {
        x: number;
        y: number;
      }

      const pos = typeof overlayOptions?.position === "string"
        ? (posMap[overlayOptions.position] ?? "W-w-20:H-h-20")
        : overlayOptions?.position
        ? `(W-w)*${(overlayOptions.position as PositionCoords).x}/100:(H-h)*${(overlayOptions.position as PositionCoords).y}/100`
        : "W-w-20:H-h-20";

      filterParts.push(`[${overlayIdx}:v]scale=${scaledW}:-2,format=rgba,colorchannelmixer=aa=${alpha}[logo]`);
      filterParts.push(`${videoOut}[logo]overlay=${pos}[vout]`);
      videoOut = "[vout]";
    }

    let audioOut = "";
    if (shouldKeepAudio) {
      if (hasMusicTrack) {
        const musicVol = (musicOptions!.musicVolume / 100).toFixed(2);
        if (hasOriginalAudio) {
          const origVol = (musicOptions!.originalAudioVolume / 100).toFixed(2);
          const origChain = afParts.length > 0
            ? `[0:a]${afParts.join(",")},volume=${origVol}[orig]`
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
    args.push(
      "-c:v", "libvpx-vp9",
      "-b:v", "0",
      "-crf", String(recipe.quality),
      "-cpu-used", "4",
      "-deadline", "realtime"
    );
    if (shouldKeepAudio) args.push("-c:a", "libopus");
  } else if (format === "mkv") {
    args.push("-c:v", "libx264", "-crf", String(recipe.quality), "-preset", "ultrafast");
    if (shouldKeepAudio) args.push("-c:a", "aac", "-b:a", "128k");
  } else {
    args.push("-c:v", "libx264", "-crf", String(recipe.quality), "-preset", "ultrafast", "-movflags", "+faststart");
    if (shouldKeepAudio) args.push("-c:a", "aac", "-b:a", "128k");
  }

  args.push(...buildDurationArgs(recipe, videoDuration));

  args.push(outputName);
  return args;
}
