import { EditRecipe, ExportResult, BackgroundMusicOptions, ImageOverlayOptions, MAX_FILE_SIZE } from "./types";
import { getPresetById } from "./presets";
import { buildTextFilter } from "./text-overlay";

export class FFmpegLoadError extends Error { }


type SerializedFile = {
  name: string;
  type: string;
  data: ArrayBuffer;
};

type WorkerExportRequest = {
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

type WorkerLoadResponse = { type: "ready" };
type WorkerProgressResponse = { type: "progress"; percent: number };
type WorkerResultResponse = {
  type: "result";
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  format: "mp4" | "webm" | "mkv" | "gif";
};
type WorkerErrorResponse = { type: "error"; id?: string; message: string };
type WorkerCancelledResponse = { type: "cancelled"; id?: string };

type WorkerResponse =
  | WorkerLoadResponse
  | WorkerProgressResponse
  | WorkerResultResponse
  | WorkerErrorResponse
  | WorkerCancelledResponse;

let ffmpegWorker: Worker | null = null;
let workerReady: Promise<void> | null = null;
let workerReadyResolve: (() => void) | null = null;
let workerReadyReject: ((reason?: any) => void) | null = null;
let pendingExport: {
  id: string;
  resolve: (result: ExportResult) => void;
  reject: (reason: unknown) => void;
} | null = null;
let pendingProgress: ((percent: number) => void) | null = null;

function createWorker(): Worker {
  if (typeof window === "undefined") {
    throw new Error("Web Workers are not available in this environment.");
  }

  // MUST be strictly inline for Next.js/Webpack to detect and compile the worker chunk
  ffmpegWorker = new Worker(new URL("./ffmpeg.worker.ts", import.meta.url), { type: "module" });

  ffmpegWorker.onmessage = handleWorkerMessage;
  ffmpegWorker.onerror = (event) => {
    const message = event.message || "FFmpeg worker error";
    const error = new FFmpegLoadError(message);
    workerReadyReject?.(error);
    pendingExport?.reject(error);
    resetWorker();
  };

  workerReady = new Promise((resolve, reject) => {
    workerReadyResolve = resolve;
    workerReadyReject = reject;
  });

  return ffmpegWorker;
}

function resetWorker() {
  ffmpegWorker = null;
  workerReady = null;
  workerReadyResolve = null;
  workerReadyReject = null;
  pendingExport = null;
  pendingProgress = null;
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
  const data = event.data;

  if (data.type === "ready") {
    workerReadyResolve?.();
    workerReadyResolve = null;
    workerReadyReject = null;
    pendingProgress?.(100);
    return;
  }

  if (data.type === "progress") {
    pendingProgress?.(data.percent);
    return;
  }

  if (data.type === "result") {
    if (pendingExport?.id !== data.id) return;
    const blob = new Blob([data.data], { type: data.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    pendingExport.resolve({
      blobUrl,
      blob,
      size: data.size,
      width: data.width,
      height: data.height,
      format: data.format,
      // Dispose method allows cleanup of blob URLs to prevent memory leaks
      // Call this when the exported video is no longer needed by the application
      dispose: () => {
        URL.revokeObjectURL(blobUrl);
      },
    });
    pendingExport = null;
    pendingProgress = null;
    return;
  }

  if (data.type === "error") {
    if (data.id && pendingExport?.id === data.id) {
      pendingExport.reject(new Error(data.message));
      pendingExport = null;
      pendingProgress = null;
      return;
    }

    workerReadyReject?.(new FFmpegLoadError(data.message));
    workerReady = null;
    workerReadyResolve = null;
    workerReadyReject = null;
    resetWorker();
    return;
  }

  if (data.type === "cancelled") {
    if (data.id && pendingExport?.id === data.id) {
      pendingExport.reject(new DOMException("Export cancelled", "AbortError"));
      pendingExport = null;
      pendingProgress = null;
    }
    return;
  }
}

async function ensureWorker() {
  if (!ffmpegWorker) {
    createWorker();
  }
}

export async function loadFFmpeg(
  signal?: AbortSignal,
  onProgress?: (percent: number) => void
): Promise<void> {
  // 1. Capture if the worker is uninitialized before ensureWorker runs
  const isFirstLoad = !ffmpegWorker;

  await ensureWorker();

  if (workerReady && workerReadyResolve === null) {
    onProgress?.(100);
    return;
  }

  // 2. Use the captured flag to securely trigger the worker's internal load phase
  if (isFirstLoad) {
    ffmpegWorker!.postMessage({ type: "load" });
  }

  pendingProgress = onProgress ?? null;

  if (signal?.aborted) {
    ffmpegWorker?.postMessage({ type: "cancel" });
    throw new DOMException("Aborted", "AbortError");
  }

  const cleanup = () => {
    signal?.removeEventListener("abort", onAbort);
  };

  const onAbort = () => {
    ffmpegWorker?.postMessage({ type: "cancel" });
    workerReadyReject?.(new DOMException("Aborted", "AbortError"));
    cleanup();
  };

  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await workerReady;
  } finally {
    cleanup();
  }
}

function cancelPendingExport(reason?: unknown) {
  if (pendingExport) {
    pendingExport.reject(reason ?? new DOMException("Export cancelled", "AbortError"));
    pendingExport = null;
  }
  pendingProgress = null;
}

export async function exportVideo(
  file: File,
  recipe: EditRecipe,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  musicOptions?: BackgroundMusicOptions,
  overlayOptions?: ImageOverlayOptions
): Promise<ExportResult> {
  await loadFFmpeg(signal, onProgress);

  if (!ffmpegWorker) {
    throw new Error("FFmpeg worker is not available.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Video file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const sessionId = buildSessionId();
  const arrayBuffer = await file.arrayBuffer();
  const filePayload: SerializedFile = {
    name: file.name,
    type: file.type || "video/mp4",
    data: arrayBuffer,
  };

  if (musicOptions?.file && musicOptions.file.size > MAX_FILE_SIZE) {
    throw new Error(`Music file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const musicFilePayload = musicOptions?.file
    ? {
      name: musicOptions.file.name,
      type: musicOptions.file.type || "audio/mpeg",
      data: await musicOptions.file.arrayBuffer(),
    }
    : undefined;

  if (overlayOptions?.file && overlayOptions.file.size > MAX_FILE_SIZE) {
    throw new Error(`Overlay file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const overlayFilePayload = overlayOptions?.file
    ? {
      name: overlayOptions.file.name,
      type: overlayOptions.file.type || "image/png",
      data: await overlayOptions.file.arrayBuffer(),
    }
    : undefined;

  const sanitizedMusicOptions = musicOptions
    ? { ...musicOptions, file: null }
    : undefined;
  const sanitizedOverlayOptions = overlayOptions
    ? { ...overlayOptions, file: null }
    : undefined;

  pendingProgress = onProgress;

  const exportPromise = new Promise<ExportResult>((resolve, reject) => {
    pendingExport = { id: sessionId, resolve, reject };
  });

  if (signal?.aborted) {
    ffmpegWorker.postMessage({ type: "cancel" });
    cancelPendingExport(new DOMException("Aborted", "AbortError"));
    throw new DOMException("Aborted", "AbortError");
  }

  const onAbort = () => {
    ffmpegWorker?.postMessage({ type: "cancel" });
    cancelPendingExport(new DOMException("Aborted", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const transfers: Transferable[] = [arrayBuffer];
  if (musicFilePayload) transfers.push(musicFilePayload.data);
  if (overlayFilePayload) transfers.push(overlayFilePayload.data);

  ffmpegWorker.postMessage(
    {
      type: "export",
      id: sessionId,
      file: filePayload,
      recipe,
      videoDuration: await getVideoDuration(file),
      musicFile: musicFilePayload,
      musicOptions: sanitizedMusicOptions,
      overlayFile: overlayFilePayload,
      overlayOptions: sanitizedOverlayOptions,
    } as WorkerExportRequest,
    transfers
  );

  try {
    return await exportPromise;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

export function terminateFFmpeg() {
  if (ffmpegWorker) {
    ffmpegWorker.postMessage({ type: "terminate" });
    ffmpegWorker.terminate();
  }
  cancelPendingExport(new DOMException("Export cancelled", "AbortError"));
  resetWorker();
}

function buildSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Fallback: use crypto.getRandomValues for cryptographically secure random bytes
  // converted to hex string, ensuring uniqueness even in concurrent scenarios
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    try {
      const randomBytes = new Uint8Array(16);
      (crypto as Crypto).getRandomValues(randomBytes);
      return Array.from(randomBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Silently fall through to next fallback if getRandomValues fails
    }
  }

  // Final fallback: if crypto methods are unavailable,
  // use a combination of timestamp and high-precision counter to reduce collisions
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const counterPart = (Math.random() * 10000000).toString(36);
  return `${timestamp}-${randomPart}${counterPart}`;
}

export function buildVideoFilter(recipe: EditRecipe, targetW: number, targetH: number): string {
  const filters: string[] = [];

  if (recipe.trimStart > 0 || recipe.trimEnd !== null) {
    // Only use trim filter with precise bounds to avoid scanning entire file
    // If trimEnd is null, use duration parameter instead of large placeholder value
    if (recipe.trimEnd !== null) {
      filters.push(`trim=start=${recipe.trimStart}:end=${recipe.trimEnd}`);
    } else if (recipe.trimStart > 0) {
      // When only trimStart is set, let FFmpeg infer end (don't use 999999 placeholder)
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

  // Add text overlays
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

function buildAudioTrimFilter(recipe: EditRecipe): string {
  if (recipe.trimStart === 0 && recipe.trimEnd === null) return "";

  // Avoid scanning entire audio with large placeholder values
  // Use precise trim bounds when available
  let trimFilter = `atrim=start=${recipe.trimStart}`;
  if (recipe.trimEnd !== null) {
    trimFilter += `:end=${recipe.trimEnd}`;
  }
  // asetpts normalizes timestamps after trim for correct stream positioning
  return `${trimFilter},asetpts=PTS-STARTPTS`;
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
        "top-right": "main_w-w-20:20",
        "bottom-left": "20:main_h-h-20",
        "bottom-right": "main_w-w-20:main_h-h-20",
      };

      interface PositionCoords {
        x: number;
        y: number;
      }

      const pos = typeof overlayOptions?.position === "string"
        ? (posMap[overlayOptions.position] ?? "main_w-w-20:main_h-h-20")
        : overlayOptions?.position
          ? `(main_w)*${(overlayOptions.position as PositionCoords).x}/100:(main_h)*${(overlayOptions.position as PositionCoords).y}/100`
          : "main_w-w-20:main_h-h-20";

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

  // Add explicit output duration when speed != 1 to prevent slight duration
  // overshoot caused by encoder/filter pipeline frame flush at stream end.
  if (recipe.speed !== 1) {
    const sourceDuration = (recipe.trimEnd ?? videoDuration) - recipe.trimStart;
    const outputDuration = sourceDuration / recipe.speed;
    args.push("-t", outputDuration.toFixed(6));
  }

  args.push(outputName);
  return args;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}