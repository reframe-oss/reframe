import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { EditRecipe, BackgroundMusicOptions, ImageOverlayOptions } from "./types";
import { getPresetById } from "./presets";
import { buildTextFilter } from "./text-overlay";

const CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
// MT core aligned to the same version and distribution format as CORE_BASE_URL.
// Previously used @0.12.6/dist/esm which caused two problems:
//   1. The version mismatch meant SRI hashes computed for @0.12.10 were applied
//      to different file contents, causing all MT fetches to fail with an integrity
//      error instead of falling back gracefully.
//   2. The ESM distribution is not consumed the same way as UMD by ffmpeg.js and
//      produced subtle runtime failures in crossOriginIsolated contexts.
const MT_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd";

// Keys are full URLs so hashes for the non-MT and MT packages never collide.
// MT hashes are omitted intentionally: fetchWithIntegrity falls back to a plain
// fetch when no hash entry exists, which is safe for a trusted CDN origin and
// avoids the previous bug where a wrong hash caused a hard IntegrityError.
// Add MT-specific sha384 entries here once they are verified against the CDN.
const SRI_HASHES: Record<string, string> = {
  [`${CORE_BASE_URL}/ffmpeg-core.js`]:   "sha384-sKfkiFtvUk+vexk+0EUhEh366190/4WpgUAsUvaxEfyg7+E1Zt5Y5hrsU808g8Q9",
  [`${CORE_BASE_URL}/ffmpeg-core.wasm`]: "sha384-U1VDhkPYrM3wTCT4/vjSpSsKqG/UjljYrYCI4hBSJ02svbCkxuCi6U6u/peg5vpW",
};

type SerializedFile = {
  name: string;
  type: string;
  data: ArrayBuffer;
};

type ExportRequest = {
  type: "export";
  id: string;
  file: SerializedFile;
  recipe: EditRecipe;
  videoDuration: number;
  musicFile?: SerializedFile;
  musicOptions?: BackgroundMusicOptions;
  overlayFile?: SerializedFile;
  overlayOptions?: ImageOverlayOptions;
};

type LoadRequest = { type: "load" };

type CancelRequest = { type: "cancel" };

type TerminateRequest = { type: "terminate" };

type WorkerCommand = LoadRequest | ExportRequest | CancelRequest | TerminateRequest;

type ProgressPayload = { type: "progress"; percent: number };

type ReadyPayload = { type: "ready" };

type ResultPayload = {
  type: "result";
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  format: "mp4" | "webm" | "mkv" | "gif";
};

type ErrorPayload = { type: "error"; id?: string; message: string };

type CancelledPayload = { type: "cancelled"; id?: string };

type WorkerResponse = ProgressPayload | ReadyPayload | ResultPayload | ErrorPayload | CancelledPayload;

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
let activeExportAbortController: AbortController | null = null;
let activeExportId: string | null = null;

async function fetchWithIntegrity(url: string, mimeType: string): Promise<string> {
  // Look up by full URL so non-MT and MT hashes never collide when filenames match.
  const integrity = SRI_HASHES[url];

  // Fallback to standard fetch if SRI is missing (Prevents ffmpeg-core.worker.js from crashing the thread)
  if (!integrity) {
    const response = await fetch(url, { credentials: "omit" });
    const blob = new Blob([await response.arrayBuffer()], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  const response = await fetch(url, { integrity, credentials: "omit" });
  const blob = new Blob([await response.arrayBuffer()], { type: mimeType });
  return URL.createObjectURL(blob);
}

function buildVideoFilter(recipe: EditRecipe, targetW: number, targetH: number): string {
  const filters: string[] = [];

  if (recipe.trimStart > 0 || recipe.trimEnd !== null) {
    const end = recipe.trimEnd !== null ? recipe.trimEnd : 999999;
    filters.push(`trim=start=${recipe.trimStart}:end=${end}`);
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

function buildAudioFilter(speed: number, normalizeAudio: boolean): string {
  if (speed <= 0) return "";
  const filters: string[] = [];

  let remaining = speed;
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

  if (normalizeAudio) filters.push("loudnorm=I=-14:TP=-1.5:LRA=11");

  return filters.join(",");
}

function buildAudioTrimFilter(recipe: EditRecipe): string {
  if (recipe.trimStart === 0 && recipe.trimEnd === null) return "";
  const end = recipe.trimEnd !== null ? recipe.trimEnd : 999999;
  return `atrim=start=${recipe.trimStart}:end=${end},asetpts=PTS-STARTPTS`;
}

function buildArguments(
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
  const audioSpeed = hasOriginalAudio ? buildAudioFilter(recipe.speed, recipe.normalizeAudio ?? false) : "";
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
    "top-left":     "20:20",
    "top-right":    "W-w-20:20",
    "bottom-left":  "20:H-h-20",
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

  if (recipe.speed !== 1) {
    const sourceDuration = (recipe.trimEnd ?? videoDuration) - recipe.trimStart;
    // Skip -t when sourceDuration <= 0 (happens when video metadata fails to
    // load and videoDuration falls back to 0). Passing -t 0 to FFmpeg produces
    // a zero-length output file; omitting it lets FFmpeg encode the full stream.
    if (sourceDuration > 0) {
      const outputDuration = sourceDuration / recipe.speed;
      args.push("-t", outputDuration.toFixed(6));
    }
  }

  args.push(outputName);
  return args;
}

async function loadCore(onProgress?: (percent: number) => void): Promise<void> {
  if (ffmpegLoaded) {
    onProgress?.(100);
    return;
  }

  ffmpeg = new FFmpeg();

  const isIsolated = typeof self !== "undefined" && self.crossOriginIsolated;
  const baseURL = isIsolated ? MT_CORE_BASE_URL : CORE_BASE_URL;

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(progress * 100));
  };

  ffmpeg.on("progress", handleProgress);

  try {
    await ffmpeg.load({
      coreURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      ...(isIsolated && {
        workerURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
      }),
    });

    ffmpegLoaded = true;
    onProgress?.(100);
  } finally {
    ffmpeg.off("progress", handleProgress);
  }
}

function serializeFileBuffer(file: SerializedFile): Uint8Array {
  return new Uint8Array(file.data);
}

function getOutputConfig(format: string, sessionId: string) {
  switch (format) {
    case "webm":
      return { filename: `output_${sessionId}.webm`, mimeType: "video/webm" };
    case "mkv":
      return { filename: `output_${sessionId}.mkv`, mimeType: "video/x-matroska" };
    case "gif":
      return { filename: `output_${sessionId}.gif`, mimeType: "image/gif" };
    default:
      return { filename: `output_${sessionId}.mp4`, mimeType: "video/mp4" };
  }
}

async function removeFile(path: string) {
  if (!ffmpeg) return;
  try {
    await ffmpeg.deleteFile(path);
  } catch {
    // ignore cleanup failures
  }
}

async function execWithTimeout(args: string[], timeoutMs = 300000): Promise<number> {
  if (!ffmpeg) throw new Error("FFmpeg engine is not loaded.");
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (activeExportAbortController && !activeExportAbortController.signal.aborted) {
        activeExportAbortController.abort();
      }
      reject(new Error("FFmpeg execution timed out. Process killed to prevent memory leak."));
    }, timeoutMs);
  });
  try {
    const execPromise = ffmpeg.exec(args, undefined, {
      signal: activeExportAbortController?.signal,
    });
    return await Promise.race([execPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runExport(request: ExportRequest): Promise<ResultPayload> {
  if (!ffmpeg) throw new Error("FFmpeg engine is not loaded.");
  if (activeExportAbortController?.signal.aborted) {
    throw new Error("Export cancelled");
  }

  const sessionId = request.id;
  const recipe = request.recipe;
  let targetW: number;
  let targetH: number;

  if (recipe.preset === "custom") {
    targetW = recipe.customWidth;
    targetH = recipe.customHeight;
  } else {
    const preset = getPresetById(recipe.preset);
    targetW = preset?.width ?? 1920;
    targetH = preset?.height ?? 1080;
  }

  targetW = Math.round(targetW / 2) * 2;
  targetH = Math.round(targetH / 2) * 2;

  const ext = request.file.name.split(".").pop() ?? "mp4";
  const inputName = `input_${sessionId}.${ext}`;

  const { filename: outputName, mimeType } = getOutputConfig(recipe.format, sessionId);
  const fallbackOutputName = `fallback_${sessionId}.webm`;
  const paletteName = `palette_${sessionId}.png`;
  const cleanupFiles = new Set<string>([inputName, outputName, fallbackOutputName, paletteName]);

  const fileBytes = serializeFileBuffer(request.file);
  await ffmpeg.writeFile(inputName, fileBytes, { signal: activeExportAbortController?.signal });

  const hasMusicTrack = !!(request.musicFile && recipe.keepAudio);
  const musicInputName = `music_input_${sessionId}.mp3`;
  if (hasMusicTrack) {
    cleanupFiles.add(musicInputName);
    await ffmpeg.writeFile(musicInputName, serializeFileBuffer(request.musicFile!), {
      signal: activeExportAbortController?.signal,
    });
  }

  const hasOverlay = !!request.overlayFile;
  const overlayExt = request.overlayFile?.name.split(".").pop() ?? "png";
  const overlayInputName = `overlay_${sessionId}.${overlayExt}`;
  if (hasOverlay) {
    cleanupFiles.add(overlayInputName);
    await ffmpeg.writeFile(overlayInputName, serializeFileBuffer(request.overlayFile!), {
      signal: activeExportAbortController?.signal,
    });
  }

  const videoDuration = request.videoDuration;

  const handleProgress = ({ progress }: { progress: number }) => {
    if (activeExportId !== sessionId) return;
    postMessage({ type: "progress", percent: Math.min(99, Math.round(progress * 100)) });
  };

  let logListener: ((event: { message: string }) => void) | null = null;
  ffmpeg.on("progress", handleProgress);

  try {
    if (recipe.format === "gif") {
      const vf = buildVideoFilter(recipe, targetW, targetH);
      const vfWithPalette = vf ? `${vf},palettegen` : "palettegen";
      const vfWithPaletteUse = vf
        ? `[0:v]${vf}[x];[x][1:v]paletteuse`
        : "[0:v][1:v]paletteuse";

      const gifDurationArgs = recipe.speed !== 1
        ? (() => {
            const sourceDuration = (recipe.trimEnd ?? videoDuration) - recipe.trimStart;
            // Skip -t when sourceDuration <= 0 (metadata load failure fallback)
            // to avoid producing a zero-length GIF.
            if (sourceDuration <= 0) return [];
            const outputDuration = sourceDuration / recipe.speed;
            return ["-t", outputDuration.toFixed(6)];
          })()
        : [];

      const pass1Code = await execWithTimeout(
        ["-i", inputName, "-vf", vfWithPalette, ...gifDurationArgs, "-y", paletteName]
      );
      if (pass1Code !== 0) throw new Error("GIF palette generation failed");

      const pass2Code = await execWithTimeout(
        ["-i", inputName, "-i", paletteName, "-lavfi", vfWithPaletteUse, ...gifDurationArgs, "-y", outputName]
      );
      if (pass2Code !== 0) throw new Error("GIF export failed");

      const data = await ffmpeg.readFile(outputName, undefined, {
        signal: activeExportAbortController?.signal,
      });
      const payload = (data as Uint8Array).buffer as ArrayBuffer;
      return {
        type: "result",
        id: sessionId,
        data: payload,
        mimeType: "image/gif",
        size: payload.byteLength,
        width: targetW,
        height: targetH,
        format: "gif",
      };
    }

    let missingAudioDetected = false;
    const logListener = ({ message }: { message: string }) => {
      const msg = message.toLowerCase();
      if (
        msg.includes("matches no streams") ||
        msg.includes("specifier '0:a'") ||
        msg.includes("input pad 0 on filter src")
      ) {
        missingAudioDetected = true;
      }
    };
    ffmpeg.on("log", logListener);

    let args = buildArguments(
      recipe,
      recipe.format,
      outputName,
      inputName,
      targetW,
      targetH,
      hasMusicTrack,
      musicInputName,
      request.musicOptions,
      hasOverlay,
      overlayInputName,
      request.overlayOptions,
      true,
      videoDuration
    );

    let exitCode = await execWithTimeout(args);

    if (exitCode !== 0 && missingAudioDetected) {
      missingAudioDetected = false;
      args = buildArguments(
        recipe,
        recipe.format,
        outputName,
        inputName,
        targetW,
        targetH,
        hasMusicTrack,
        musicInputName,
        request.musicOptions,
        hasOverlay,
        overlayInputName,
        request.overlayOptions,
        false,
        videoDuration
      );
      exitCode = await execWithTimeout(args);
    }

    if (exitCode !== 0) {
      args = buildArguments(
        recipe,
        "webm",
        fallbackOutputName,
        inputName,
        targetW,
        targetH,
        hasMusicTrack,
        musicInputName,
        request.musicOptions,
        hasOverlay,
        overlayInputName,
        request.overlayOptions,
        !missingAudioDetected,
        videoDuration
      );

      const fallbackCode = await execWithTimeout(args);
      if (fallbackCode !== 0) throw new Error("Export failed");

      const data = await ffmpeg.readFile(fallbackOutputName, undefined, {
        signal: activeExportAbortController?.signal,
      });
      const payload = (data as Uint8Array).buffer as ArrayBuffer;
      return {
        type: "result",
        id: sessionId,
        data: payload,
        mimeType: "video/webm",
        size: payload.byteLength,
        width: targetW,
        height: targetH,
        format: "webm",
      };
    }

    const data = await ffmpeg.readFile(outputName, undefined, {
      signal: activeExportAbortController?.signal,
    });
    const payload = (data as Uint8Array).buffer as ArrayBuffer;
    return {
      type: "result",
      id: sessionId,
      data: payload,
      mimeType: mimeType,
      size: payload.byteLength,
      width: targetW,
      height: targetH,
      format: recipe.format,
    };
  } finally {
    ffmpeg.off("progress", handleProgress);
    if (logListener) ffmpeg.off("log", logListener);
    for (const path of cleanupFiles) {
      await removeFile(path);
    }
  }
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
  const data = event.data;
  if (data.type === "progress") {
    postMessage(data);
    return;
  }
  if (data.type === "ready") {
    postMessage(data);
    return;
  }
  if (data.type === "result") {
    postMessage(data);
    return;
  }
  if (data.type === "error") {
    postMessage(data);
    return;
  }
  if (data.type === "cancelled") {
    postMessage(data);
    return;
  }
}

async function handleCommand(message: WorkerCommand) {
  switch (message.type) {
    case "load": {
      try {
        await loadCore();
        postMessage({ type: "ready" });
      } catch (error) {
        postMessage({ type: "error", message: (error as Error).message });
      }
      return;
    }
    case "export": {
      if (!ffmpeg) {
        postMessage({ type: "error", id: message.id, message: "FFmpeg engine is not loaded." });
        return;
      }
      if (activeExportAbortController?.signal.aborted) {
        postMessage({ type: "cancelled", id: message.id });
        return;
      }

      activeExportAbortController = new AbortController();
      activeExportId = message.id;

      try {
        const result = await runExport(message);
        if (activeExportAbortController?.signal.aborted) {
          postMessage({ type: "cancelled", id: message.id });
          return;
        }
        postMessage({ ...result }, [result.data]);
      } catch (error) {
        if (activeExportAbortController?.signal.aborted) {
          postMessage({ type: "cancelled", id: message.id });
        } else {
          postMessage({ type: "error", id: message.id, message: (error as Error).message });
        }
      } finally {
        activeExportAbortController = null;
        activeExportId = null;
      }
      return;
    }
    case "cancel": {
      if (activeExportAbortController && !activeExportAbortController.signal.aborted) {
        activeExportAbortController.abort();
      }
      return;
    }
    case "terminate": {
      if (ffmpeg) ffmpeg.terminate();
      ffmpeg = null;
      ffmpegLoaded = false;
      self.close();
      return;
    }
  }
}

self.addEventListener("message", (event) => {
  handleCommand(event.data as WorkerCommand).catch((error) => {
    postMessage({ type: "error", message: (error as Error).message });
  });
});
