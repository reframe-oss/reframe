/**
 * Thumbnail extraction for the timeline strip.
 *
 * Frames are captured by seeking a single offscreen <video> sequentially.
 * Seeking in parallel would multiply decoder instances and memory for little
 * gain, so it is deliberately one seek at a time. Work is abortable, every
 * seek has a timeout (some files never fire `seeked` for certain positions),
 * and every object URL created is either handed to the caller or revoked.
 */

/** Upper bound on frames per video so long files don't produce hundreds of seeks. */
export const MAX_THUMBNAILS = 48;

export interface ThumbnailFrame {
  time: number;
  url: string;
}

export interface GenerateThumbnailsOptions {
  signal?: AbortSignal;
  width?: number;
  height?: number;
  /** Per-seek timeout; a frame that times out is skipped, not fatal. */
  seekTimeoutMs?: number;
  metadataTimeoutMs?: number;
  /** Frames are reported in batches to keep React updates infrequent. */
  batchSize?: number;
  onBatch?: (frames: ThumbnailFrame[], completed: number, total: number) => void;
  /** Injection points for tests (jsdom has no media pipeline or canvas). */
  createElement?: typeof document.createElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export interface GenerateThumbnailsResult {
  frames: ThumbnailFrame[];
  /** Number of positions that could not be captured (seek timeout / draw failure). */
  skipped: number;
}

/** Seconds between thumbnails, scaled to the clip length. */
export function pickThumbnailInterval(duration: number): number {
  if (duration <= 30) return 2;
  if (duration <= 120) return 5;
  if (duration <= 300) return 15;
  return 30;
}

/**
 * Timestamps to capture: every `intervalSeconds`, widened if needed so the
 * total never exceeds `max`, de-duplicated to whole seconds (the label
 * granularity), plus a frame near the end so the strip covers the full clip.
 */
export function computeThumbnailTimes(
  duration: number,
  intervalSeconds: number,
  max: number = MAX_THUMBNAILS
): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || max <= 0) return [];

  const interval = Math.max(intervalSeconds, duration / max, 0.1);
  const last = Math.max(0, duration - 0.1);
  const times: number[] = [];
  const seen = new Set<number>();

  const push = (t: number) => {
    const key = Math.floor(t);
    if (seen.has(key)) return;
    seen.add(key);
    times.push(Number(t.toFixed(3)));
  };

  for (let t = 0; t < last && times.length < max; t += interval) push(t);
  if (times.length < max && last > (times[times.length - 1] ?? -1)) push(last);

  return times;
}

function abortError() {
  return new DOMException("Thumbnail generation aborted", "AbortError");
}

function waitForEvent(
  target: HTMLVideoElement,
  event: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<"ok" | "timeout"> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const done = (result: "ok" | "timeout" | Error) => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const onEvent = () => done("ok");
    const onError = () => done(new Error("Video could not be decoded for thumbnails"));
    const onAbort = () => done(abortError());
    const timer = setTimeout(() => done("timeout"), timeoutMs);
    target.addEventListener(event, onEvent);
    target.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function generateThumbnails(
  src: string,
  times: number[],
  {
    signal,
    width = 160,
    height = 90,
    seekTimeoutMs = 4000,
    metadataTimeoutMs = 10000,
    batchSize = 6,
    onBatch,
    createElement = document.createElement.bind(document),
    createObjectURL = (blob) => URL.createObjectURL(blob),
    revokeObjectURL = (url) => URL.revokeObjectURL(url),
  }: GenerateThumbnailsOptions = {}
): Promise<GenerateThumbnailsResult> {
  const frames: ThumbnailFrame[] = [];
  let skipped = 0;

  const video = createElement("video") as HTMLVideoElement;
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;

  try {
    // `loadeddata` (not `loadedmetadata`): the first frame must be decoded,
    // otherwise the seek to 0s resolves immediately and draws a black frame.
    const firstFrameReady = waitForEvent(video, "loadeddata", metadataTimeoutMs, signal);
    video.src = src;
    video.load();
    if ((await firstFrameReady) === "timeout") {
      throw new Error("Timed out loading video metadata for thumbnails");
    }

    const canvas = createElement("canvas") as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    for (let i = 0; i < times.length; i++) {
      if (signal?.aborted) throw abortError();
      const time = times[i] ?? 0;

      const seeked = waitForEvent(video, "seeked", seekTimeoutMs, signal);
      video.currentTime = time;
      if ((await seeked) === "timeout") {
        skipped++;
      } else {
        try {
          ctx.drawImage(video, 0, 0, width, height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.7)
          );
          if (signal?.aborted) throw abortError();
          if (blob) frames.push({ time, url: createObjectURL(blob) });
          else skipped++;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          skipped++;
        }
      }

      const completed = i + 1;
      if (completed === times.length || completed % batchSize === 0) {
        onBatch?.(frames.slice(), completed, times.length);
      }
    }

    return { frames, skipped };
  } catch (err) {
    // Nothing was handed to the caller as a final result, so release it all.
    frames.forEach((f) => revokeObjectURL(f.url));
    throw err;
  } finally {
    // Detach the source so the browser can release the decoder immediately.
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // ignore — some environments throw on load() without a source
    }
  }
}
