import { EditRecipe, ExportResult, BackgroundMusicOptions, ImageOverlayOptions, MAX_FILE_SIZE, type OutputFormat } from "./types";
import { trackTiming } from "./telemetry";
import { startEngineLoad, type StallReason } from "./exportTelemetry";
import { expectedOutputSeconds, isUsableDuration, type EngineMode } from "./ffmpegArgs";
import { resolveDuration } from "./mediaDuration";

// The command line itself is built in ffmpegArgs.ts and run by the worker.
export { buildVideoFilter, buildAudioFilter } from "./ffmpegArgs";

export class FFmpegLoadError extends Error {
  name = "FFmpegLoadError";
  /** Set when the worker script itself failed, for telemetry classification. */
  constructor(message: string, readonly source?: "worker_script") {
    super(message);
  }
}

/**
 * Why the watchdog gave up on an export:
 *   - no_activity: the engine went silent (the multi-threaded deadlock);
 *   - no_progress: FFmpeg kept logging but encoded nothing new;
 *   - overrun: it encoded well past the length the export should have.
 */
export type { StallReason };

const STALL_MESSAGES: Record<StallReason, string> = {
  no_activity: "The export stopped responding.",
  no_progress: "The export stopped making progress.",
  overrun: "The export kept running past the end of the video.",
};

/** The watchdog stopped an export that wasn't going to finish. */
export class ExportStalledError extends Error {
  name = "ExportStalledError";
  constructor(
    readonly mode: EngineMode,
    readonly reason: StallReason = "no_activity"
  ) {
    super(
      `${STALL_MESSAGES[reason]} ` +
        (mode === "multi"
          ? "Press Retry export to try again with the single-threaded engine, which is slower but more reliable."
          : "Press Retry export to try again, or try a shorter clip or a lower resolution.")
    );
  }
}

/**
 * FFmpeg prints a stats line about every 0.5 s while encoding and the worker
 * forwards a heartbeat at most every 2 s, so a minute of silence means the
 * run is wedged (the multi-threaded core's thread-pool deadlock looked
 * exactly like this: stuck at 0% forever). Fail instead of spinning.
 */
export const STALL_TIMEOUT_MS = 60_000;

/**
 * FFmpeg can keep printing log lines while encoding nothing (for example a
 * filter that never gets input). Two minutes without a new encoded second
 * means it won't finish. Long enough for the slowest legitimate gap: the GIF
 * palette pass and muxing a large file at the end.
 */
export const NO_PROGRESS_TIMEOUT_MS = 120_000;

/** How far past the expected length encoding may run before it's an overrun. */
export function overrunLimitSeconds(expectedSeconds: number): number {
  return expectedSeconds * 1.25 + 15;
}


/**
 * A file for the worker. `blob` is the user's File itself: it crosses to the
 * worker by reference and the worker reads it, so the page never holds a
 * copy of the bytes (a 300 MB read on the page caused multi-second GC pauses).
 * `data` (raw bytes) is still accepted.
 */
type SerializedFile = {
  name: string;
  type: string;
  blob?: Blob;
  data?: ArrayBuffer;
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

type WorkerJoinRequest = {
  type: "join";
  id: string;
  clips: { file: File; duration: number }[];
  width: number;
  height: number;
};

type WorkerLoadResponse = { type: "ready"; mode: EngineMode };
type WorkerHeartbeatResponse = { type: "heartbeat" };
type WorkerProgressResponse = { type: "progress"; percent: number; outputSeconds?: number };
type WorkerResultResponse = {
  type: "result";
  id: string;
  /** The output, already wrapped by the worker (current workers). */
  blob?: Blob;
  /** The output as raw bytes (older workers and tests). */
  data?: ArrayBuffer;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  format: OutputFormat;
};
type WorkerErrorResponse = { type: "error"; id?: string; message: string };
type WorkerCancelledResponse = { type: "cancelled"; id?: string };

type WorkerFramesResponse =
  | { type: "frame"; id: string; index: number; time: number; blob: Blob }
  | { type: "frames-done"; id: string; skipped: number }
  | { type: "frames-error"; id: string; message: string }
  | { type: "frames-cancelled"; id: string };

type WorkerResponse =
  | WorkerLoadResponse
  | WorkerHeartbeatResponse
  | WorkerProgressResponse
  | WorkerResultResponse
  | WorkerErrorResponse
  | WorkerCancelledResponse
  | WorkerFramesResponse;

/** A timeline frame from FFmpeg: a small JPEG for `time` seconds. */
export interface TimelineFrame {
  index: number;
  time: number;
  blob: Blob;
}

/** The worker is exporting (or making frames); ask again later. */
export class EngineBusyError extends Error {
  name = "EngineBusyError";
}

/** Frame jobs waiting on the worker, by id. */
const pendingFrames = new Map<
  string,
  { onFrame: (frame: TimelineFrame) => void; resolve: (skipped: number) => void; reject: (reason: unknown) => void }
>();

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
/**
 * Called on any sign of life from the worker during an export, with the
 * encoded output time when the worker reports it.
 */
let pendingActivity: ((outputSeconds?: number) => void) | null = null;
/** The core the current worker loaded, once it is ready. */
let engineMode: EngineMode | null = null;
/**
 * Set after a multi-threaded export stalls: later workers in this page
 * session load the single-threaded core even though the page is isolated.
 */
let preferSingleThread = false;
/** Telemetry for the load in progress, if any. */
let engineLoad: ReturnType<typeof startEngineLoad> | null = null;

function createWorker(): Worker {
  if (typeof window === "undefined") {
    throw new Error("Web Workers are not available in this environment.");
  }

  // MUST be strictly inline for Next.js/Webpack to detect and compile the worker chunk
  ffmpegWorker = new Worker(new URL("./ffmpeg.worker.ts", import.meta.url), { type: "module" });
  
  ffmpegWorker.onmessage = handleWorkerMessage;
  ffmpegWorker.onerror = (event) => {
    const message = event.message || "FFmpeg worker error";
    const error = new FFmpegLoadError(message, "worker_script");
    if (workerReadyReject) engineLoad?.failed(error);
    engineLoad = null;
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

/**
 * Wraps a progress callback so it only fires when the rounded percentage
 * changes. FFmpeg reports progress per encoded frame; forwarding every event
 * re-rendered the editor hundreds of times per export for no visible change.
 */
export function dedupeProgress(onProgress?: (percent: number) => void) {
  if (!onProgress) return undefined;
  let last = -1;
  return (percent: number) => {
    const rounded = Math.max(0, Math.min(100, Math.round(percent)));
    if (rounded === last) return;
    last = rounded;
    onProgress(rounded);
  };
}

function resetWorker() {
  // A load that never finished was abandoned (cancelled), not failed.
  engineLoad?.abandoned();
  engineLoad = null;
  ffmpegWorker?.terminate();
  ffmpegWorker = null;
  engineMode = null;
  pendingActivity = null;
  workerReady = null;
  workerReadyResolve = null;
  workerReadyReject = null;
  pendingExport = null;
  pendingProgress = null;
  for (const job of pendingFrames.values()) job.reject(new DOMException("Engine restarted", "AbortError"));
  pendingFrames.clear();
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
  const data = event.data;

  if (data.type === "frame" || data.type === "frames-done" || data.type === "frames-error" || data.type === "frames-cancelled") {
    const job = pendingFrames.get(data.id);
    if (!job) return;
    if (data.type === "frame") {
      job.onFrame({ index: data.index, time: data.time, blob: data.blob });
      return;
    }
    pendingFrames.delete(data.id);
    if (data.type === "frames-done") job.resolve(data.skipped);
    else if (data.type === "frames-cancelled") job.reject(new DOMException("Frames cancelled", "AbortError"));
    else job.reject(data.message === "busy" ? new EngineBusyError("The engine is busy") : new Error(data.message));
    return;
  }

  if (data.type === "ready") {
    engineMode = data.mode ?? "single";
    engineLoad?.succeeded(engineMode);
    engineLoad = null;
    workerReadyResolve?.();
    workerReadyResolve = null;
    workerReadyReject = null;
    pendingProgress?.(100);
    return;
  }

  if (data.type === "heartbeat") {
    pendingActivity?.();
    return;
  }

  if (data.type === "progress") {
    pendingActivity?.(data.outputSeconds);
    pendingProgress?.(data.percent);
    return;
  }

  if (data.type === "result") {
    if (pendingExport?.id !== data.id) return;
    const blob = data.blob ?? new Blob([data.data ?? new ArrayBuffer(0)], { type: data.mimeType });
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

    // An error without a matching id means the worker itself failed. Settle
    // whatever is waiting on it — an export left pending here used to keep
    // the UI on "Exporting" forever.
    const error = new FFmpegLoadError(data.message);
    if (workerReadyReject) engineLoad?.failed(error);
    engineLoad = null;
    workerReadyReject?.(error);
    pendingExport?.reject(error);
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
    const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
    engineLoad = startEngineLoad(
      isolated && !preferSingleThread ? "multi" : "single",
      !isolated ? "not_isolated" : preferSingleThread ? "after_stall" : null
    );
    ffmpegWorker!.postMessage({ type: "load", singleThread: preferSingleThread });
  }

  pendingProgress = dedupeProgress(onProgress) ?? null;

  // A load can't be interrupted inside the worker, so cancelling one
  // discards the worker; the next attempt starts a fresh one (the core files
  // come back from the HTTP cache).
  if (signal?.aborted) {
    terminateFFmpeg();
    throw new DOMException("Aborted", "AbortError");
  }

  const cleanup = () => {
    signal?.removeEventListener("abort", onAbort);
  };

  const onAbort = () => {
    terminateFFmpeg();
    cleanup();
  };

  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // ffmpeg_load_success / ffmpeg_load_failure are reported once per worker
    // by handleWorkerMessage, however many callers wait on the same load.
    await workerReady;
    if (isFirstLoad) trackTiming("ffmpeg_ready");
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
  pendingActivity = null;
}

/**
 * Exports `file` with `recipe`. If the multi-threaded engine stalls, the same
 * export (same file and edits) is retried once on the single-threaded engine,
 * and `onEngineFallback` is told why before the retry starts.
 */
export async function exportVideo(
  file: File,
  recipe: EditRecipe,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  musicOptions?: BackgroundMusicOptions,
  overlayOptions?: ImageOverlayOptions,
  knownDuration?: number,
  onEngineFallback?: (reason: StallReason) => void
): Promise<ExportResult> {
  try {
    return await exportOnce(file, recipe, onProgress, signal, musicOptions, overlayOptions, knownDuration);
  } catch (err) {
    if (!(err instanceof ExportStalledError) || err.mode !== "multi" || signal?.aborted) throw err;
    // The stall set preferSingleThread, so this loads the single-threaded core.
    // The worker reads the File itself, so the retry just sends it again.
    onEngineFallback?.(err.reason);
    onProgress(0);
    return exportOnce(file, recipe, onProgress, signal, musicOptions, overlayOptions, knownDuration);
  }
}

async function exportOnce(
  file: File,
  recipe: EditRecipe,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  musicOptions?: BackgroundMusicOptions,
  overlayOptions?: ImageOverlayOptions,
  /** Duration already read by the editor; skips a second metadata load. */
  knownDuration?: number
): Promise<ExportResult> {
  await loadFFmpeg(signal);

  if (!ffmpegWorker) {
    throw new Error("FFmpeg worker is not available.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Video file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const sessionId = buildSessionId();
  const filePayload: SerializedFile = {
    name: file.name,
    type: file.type || "video/mp4",
    blob: file,
  };

  if (musicOptions?.file && musicOptions.file.size > MAX_FILE_SIZE) {
    throw new Error(`Music file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const musicFilePayload = musicOptions?.file
    ? {
        name: musicOptions.file.name,
        type: musicOptions.file.type || "audio/mpeg",
        blob: musicOptions.file,
      }
    : undefined;

  if (overlayOptions?.file && overlayOptions.file.size > MAX_FILE_SIZE) {
    throw new Error(`Overlay file exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  const overlayFilePayload = overlayOptions?.file
    ? {
        name: overlayOptions.file.name,
        type: overlayOptions.file.type || "image/png",
        blob: overlayOptions.file,
      }
    : undefined;

  const sanitizedMusicOptions = musicOptions
    ? { ...musicOptions, file: null }
    : undefined;
  const sanitizedOverlayOptions = overlayOptions
    ? { ...overlayOptions, file: null }
    : undefined;

  const videoDuration = isUsableDuration(knownDuration) ? knownDuration : await getVideoDuration(file);
  return runEngineJob(
    {
      type: "export",
      id: sessionId,
      file: filePayload,
      recipe,
      videoDuration,
      musicFile: musicFilePayload,
      musicOptions: sanitizedMusicOptions,
      overlayFile: overlayFilePayload,
      overlayOptions: sanitizedOverlayOptions,
    } satisfies WorkerExportRequest,
    expectedOutputSeconds(recipe, videoDuration),
    onProgress,
    signal
  );
}

/**
 * Sends one export-like job (an export or a join) to the worker and waits
 * for its result, with cancel and the stall watchdog: a job that stops
 * reporting, stops advancing or runs far past `expectedSeconds` is stopped
 * with an ExportStalledError and the worker discarded.
 */
async function runEngineJob(
  message: WorkerExportRequest | WorkerJoinRequest,
  expectedSeconds: number | null,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  if (!ffmpegWorker) throw new Error("FFmpeg worker is not available.");
  const sessionId = message.id;
  pendingProgress = dedupeProgress(onProgress) ?? null;

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

  const mode = engineMode ?? "single";
  let lastActivity = Date.now();
  let lastAdvance = Date.now();
  let encodedSeconds = -1;
  let overrun = false;
  pendingActivity = (outputSeconds) => {
    const now = Date.now();
    lastActivity = now;
    if (outputSeconds === undefined || outputSeconds === encodedSeconds) return;
    // Any change counts: the GIF export restarts its clock for the second pass.
    encodedSeconds = outputSeconds;
    lastAdvance = now;
    if (expectedSeconds !== null && outputSeconds > overrunLimitSeconds(expectedSeconds)) overrun = true;
  };
  const watchdog = setInterval(() => {
    const now = Date.now();
    const reason: StallReason | null = overrun
      ? "overrun"
      : now - lastActivity >= STALL_TIMEOUT_MS
        ? "no_activity"
        : // Only once the worker reports encoded time; without it, activity is all we know.
          encodedSeconds >= 0 && now - lastAdvance >= NO_PROGRESS_TIMEOUT_MS
          ? "no_progress"
          : null;
    if (!reason) return;
    clearInterval(watchdog);
    if (mode === "multi") preferSingleThread = true;
    cancelPendingExport(new ExportStalledError(mode, reason));
    // A wedged worker can't be told to stop; discard it (this also frees its
    // memory, including the files in FFmpeg's virtual filesystem).
    resetWorker();
  }, 5_000);

  ffmpegWorker.postMessage(message);

  try {
    return await exportPromise;
  } finally {
    clearInterval(watchdog);
    pendingActivity = null;
    signal?.removeEventListener("abort", onAbort);
  }
}

/** A clip to join, with the length the editor read for it (0 when unknown). */
export interface JoinClipSource {
  file: File;
  duration: number;
}

/**
 * Joins `clips` end to end into one MP4 at `width` × `height` (the first
 * clip's size), in the worker. Like an export, it can be cancelled, and a
 * stall on the multi-threaded engine retries once on the single-threaded one.
 */
export async function joinClips(
  clips: JoinClipSource[],
  width: number,
  height: number,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  onEngineFallback?: (reason: StallReason) => void
): Promise<ExportResult> {
  const once = async () => {
    await loadFFmpeg(signal);
    const message: WorkerJoinRequest = {
      type: "join",
      id: buildSessionId(),
      clips: clips.map(({ file, duration }) => ({ file, duration: isUsableDuration(duration) ? duration : 0 })),
      width,
      height,
    };
    const total = message.clips.every((clip) => clip.duration > 0)
      ? message.clips.reduce((sum, clip) => sum + clip.duration, 0)
      : null;
    return runEngineJob(message, total, onProgress, signal);
  };
  try {
    return await once();
  } catch (err) {
    if (!(err instanceof ExportStalledError) || err.mode !== "multi" || signal?.aborted) throw err;
    onEngineFallback?.(err.reason);
    onProgress(0);
    return once();
  }
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (value: number) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(Number.isFinite(value) ? value : 0);
    };
    // 0 makes the worker omit -t, so a stalled metadata read degrades safely.
    const timer = setTimeout(() => finish(0), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      // Live-recorded files need a seek before the browser knows their length.
      void resolveDuration(video).then(finish);
    };
    video.onerror = () => finish(0);
    video.src = url;
  });
}

export function terminateFFmpeg() {
  if (ffmpegWorker) {
    ffmpegWorker.postMessage({ type: "terminate" });
    ffmpegWorker.terminate();
  }
  // Settle a load that is still in flight so its caller never hangs.
  workerReadyReject?.(new DOMException("Export cancelled", "AbortError"));
  cancelPendingExport(new DOMException("Export cancelled", "AbortError"));
  resetWorker();
}

/** Test/diagnostic helper: whether a worker or export is currently held. */
export function getFFmpegClientState() {
  return {
    hasWorker: ffmpegWorker !== null,
    hasPendingExport: pendingExport !== null,
    hasPendingProgress: pendingProgress !== null,
  };
}

/**
 * Makes small JPEG frames of `file` at `times` with FFmpeg, in the worker,
 * reporting each as it is ready. Loads the engine if needed. Rejects with an
 * AbortError if `signal` aborts or an export takes the engine, and with
 * EngineBusyError if an export is running. Resolves with the number of times
 * that couldn't be captured.
 */
export async function extractFrames(
  file: File,
  times: number[],
  width: number,
  onFrame: (frame: TimelineFrame) => void,
  signal?: AbortSignal
): Promise<number> {
  // Not loadFFmpeg(signal): cancelling a load discards the worker, and an
  // export or join that starts meanwhile (which is what pauses the frames)
  // waits on that same load. Let it finish and stop afterwards.
  await loadFFmpeg();
  if (!ffmpegWorker) throw new Error("FFmpeg worker is not available.");
  if (signal?.aborted) throw new DOMException("Frames cancelled", "AbortError");
  if (pendingExport) throw new EngineBusyError("The engine is busy");
  const id = buildSessionId();
  const worker = ffmpegWorker;
  const done = new Promise<number>((resolve, reject) => {
    pendingFrames.set(id, { onFrame, resolve, reject });
  });
  const onAbort = () => worker.postMessage({ type: "cancel-frames", id });
  signal?.addEventListener("abort", onAbort, { once: true });
  worker.postMessage({ type: "frames", id, file, times, width });
  try {
    return await done;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** The loaded core ("multi" | "single"), or null before the engine is ready. */
export function getEngineMode(): EngineMode | null {
  return engineMode;
}

/** Test helper: forget the single-thread preference set by a stall. */
export function resetEnginePreferenceForTests() {
  preferSingleThread = false;
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}