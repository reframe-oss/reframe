import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { EditRecipe, BackgroundMusicOptions, ImageOverlayOptions } from "./types";
import { getPresetById } from "./presets";
import { buildArguments, buildGifArguments, resolveThreadCount, type EngineMode } from "./ffmpegArgs";

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

type LoadRequest = {
  type: "load";
  /** Load the single-threaded core even when cross-origin isolated (after a stall). */
  singleThread?: boolean;
};

type CancelRequest = { type: "cancel" };

type TerminateRequest = { type: "terminate" };

type WorkerCommand = LoadRequest | ExportRequest | CancelRequest | TerminateRequest;

type ProgressPayload = { type: "progress"; percent: number };

type ReadyPayload = { type: "ready"; mode: EngineMode };

type HeartbeatPayload = { type: "heartbeat" };

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

type WorkerResponse = ProgressPayload | ReadyPayload | HeartbeatPayload | ResultPayload | ErrorPayload | CancelledPayload;

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
/** Which core actually loaded — decides the thread flags, not crossOriginIsolated alone. */
let engineMode: EngineMode = "single";
let activeExportAbortController: AbortController | null = null;
let activeExportId: string | null = null;

/** Liveness signal for the client's stall watchdog (see ffmpeg.ts). */
const HEARTBEAT_INTERVAL_MS = 2000;
let lastHeartbeat = 0;
function heartbeat() {
  const now = Date.now();
  if (now - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeat = now;
  postMessage({ type: "heartbeat" });
}

async function fetchWithIntegrity(url: string, mimeType: string): Promise<string> {
  // Look up by full URL so non-MT and MT hashes never collide when filenames match.
  const integrity = SRI_HASHES[url];

  // Fallback to standard fetch if SRI is missing (Prevents ffmpeg-core.worker.js from crashing the thread)
  if (!integrity) {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error(`Failed to fetch engine file (HTTP ${response.status})`);
    const blob = new Blob([await response.arrayBuffer()], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  const response = await fetch(url, { integrity, credentials: "omit" });
  if (!response.ok) throw new Error(`Failed to fetch engine file (HTTP ${response.status})`);
  const blob = new Blob([await response.arrayBuffer()], { type: mimeType });
  return URL.createObjectURL(blob);
}

async function loadCoreFrom(mode: EngineMode): Promise<void> {
  ffmpeg = new FFmpeg();
  const baseURL = mode === "multi" ? MT_CORE_BASE_URL : CORE_BASE_URL;
  try {
    await ffmpeg.load({
      coreURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      ...(mode === "multi" && {
        workerURL: await fetchWithIntegrity(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
      }),
    });
  } catch (error) {
    ffmpeg.terminate();
    ffmpeg = null;
    throw error;
  }
  engineMode = mode;
  ffmpegLoaded = true;
}

async function loadCore(singleThread = false): Promise<void> {
  if (ffmpegLoaded) return;

  // The multi-threaded core needs SharedArrayBuffer, which only exists when
  // the page is cross-origin isolated (COOP + COEP headers).
  const canUseMulti = !singleThread && typeof self !== "undefined" && self.crossOriginIsolated;
  if (!canUseMulti) {
    await loadCoreFrom("single");
    return;
  }
  try {
    await loadCoreFrom("multi");
  } catch {
    // e.g. the MT files failed to download or instantiate. The single-threaded
    // core is slower but works everywhere, so fall back rather than fail.
    await loadCoreFrom("single");
  }
}

/** ffmpeg.exec rejects with a plain string when the wasm core traps. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const threads = resolveThreadCount(engineMode, self.navigator?.hardwareConcurrency);
  const signal = activeExportAbortController?.signal;

  // FFmpeg emits progress per frame; post only when the whole percentage
  // changes so the main thread isn't flooded with identical updates.
  let lastPercent = -1;
  const handleProgress = ({ progress }: { progress: number }) => {
    if (activeExportId !== sessionId) return;
    heartbeat();
    const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
    if (percent === lastPercent) return;
    lastPercent = percent;
    postMessage({ type: "progress", percent });
  };

  // FFmpeg prints a stats line about twice a second while it works, so log
  // output doubles as a heartbeat even when progress can't be computed.
  let missingAudioDetected = false;
  const handleLog = ({ message }: { message: string }) => {
    heartbeat();
    const msg = message.toLowerCase();
    if (
      msg.includes("matches no streams") ||
      msg.includes("specifier '0:a'") ||
      msg.includes("input pad 0 on filter src")
    ) {
      missingAudioDetected = true;
    }
  };

  ffmpeg.on("progress", handleProgress);
  ffmpeg.on("log", handleLog);
  lastHeartbeat = 0;
  heartbeat();

  const read = async (name: string) => {
    const data = await ffmpeg!.readFile(name, undefined, { signal });
    return (data as Uint8Array).buffer as ArrayBuffer;
  };

  try {
    if (recipe.format === "gif") {
      const gif = buildGifArguments({
        recipe,
        inputName,
        paletteName,
        outputName,
        targetW,
        targetH,
        videoDuration,
        threads,
      });
      const pass1Code = await ffmpeg.exec(gif.palette, undefined, { signal });
      if (pass1Code !== 0) throw new Error("GIF palette generation failed");
      const pass2Code = await ffmpeg.exec(gif.render, undefined, { signal });
      if (pass2Code !== 0) throw new Error("GIF export failed");

      const payload = await read(outputName);
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

    const argsFor = (format: "mp4" | "webm" | "mkv", output: string, hasOriginalAudio: boolean) =>
      buildArguments({
        recipe,
        format,
        inputName,
        outputName: output,
        targetW,
        targetH,
        videoDuration,
        hasOriginalAudio,
        music: hasMusicTrack ? { inputName: musicInputName, options: request.musicOptions! } : undefined,
        overlay: hasOverlay ? { inputName: overlayInputName, options: request.overlayOptions! } : undefined,
        threads,
      });

    let exitCode = await ffmpeg.exec(argsFor(recipe.format, outputName, true), undefined, { signal });

    if (exitCode !== 0 && missingAudioDetected) {
      // Retry without the original audio track (the source has none).
      exitCode = await ffmpeg.exec(argsFor(recipe.format, outputName, false), undefined, { signal });
    }

    if (exitCode !== 0) {
      // Last resort: WebM (VP8), for inputs the H.264 path rejects.
      const fallbackCode = await ffmpeg.exec(
        argsFor("webm", fallbackOutputName, !missingAudioDetected),
        undefined,
        { signal }
      );
      if (fallbackCode !== 0) throw new Error("Export failed");

      const payload = await read(fallbackOutputName);
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

    const payload = await read(outputName);
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
    // Both listeners must come off: the worker outlives each export, and a
    // leaked log listener used to accumulate on every run.
    ffmpeg.off("progress", handleProgress);
    ffmpeg.off("log", handleLog);
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
        await loadCore(message.singleThread);
        postMessage({ type: "ready", mode: engineMode });
      } catch (error) {
        postMessage({ type: "error", message: errorMessage(error) });
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
          postMessage({ type: "error", id: message.id, message: errorMessage(error) });
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
    postMessage({ type: "error", message: errorMessage(error) });
  });
});
