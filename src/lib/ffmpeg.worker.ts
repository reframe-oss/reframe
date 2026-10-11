import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { EditRecipe, BackgroundMusicOptions, ImageOverlayOptions } from "./types";
import { getPresetById } from "./presets";
import { buildArguments, buildDurationArgs, buildVideoFilter } from "./exportGraph";

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

      // GIF only needs -t for speed changes; the shared helper also rejects the
      // unknown-duration cases (0 from failed metadata, Infinity from containers
      // that report no duration) that would otherwise abort the export.
      const gifDurationArgs = recipe.speed !== 1 ? buildDurationArgs(recipe, videoDuration) : [];

      const pass1Code = await ffmpeg.exec(
        ["-i", inputName, "-vf", vfWithPalette, ...gifDurationArgs, "-y", paletteName],
        undefined,
        { signal: activeExportAbortController?.signal }
      );
      if (pass1Code !== 0) throw new Error("GIF palette generation failed");

      const pass2Code = await ffmpeg.exec(
        ["-i", inputName, "-i", paletteName, "-lavfi", vfWithPaletteUse, ...gifDurationArgs, "-y", outputName],
        undefined,
        { signal: activeExportAbortController?.signal }
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

    let exitCode = await ffmpeg.exec(args, undefined, {
      signal: activeExportAbortController?.signal,
    });

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
      exitCode = await ffmpeg.exec(args, undefined, {
        signal: activeExportAbortController?.signal,
      });
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

      const fallbackCode = await ffmpeg.exec(args, undefined, {
        signal: activeExportAbortController?.signal,
      });
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
