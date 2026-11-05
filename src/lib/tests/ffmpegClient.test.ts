import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadFFmpeg,
  exportVideo,
  extractFrames,
  joinClips,
  terminateFFmpeg,
  dedupeProgress,
  getFFmpegClientState,
  getEngineMode,
  resetEnginePreferenceForTests,
  FFmpegLoadError,
  ExportStalledError,
  STALL_TIMEOUT_MS,
  NO_PROGRESS_TIMEOUT_MS,
  overrunLimitSeconds,
} from "../ffmpeg";
import { DEFAULT_RECIPE } from "../constants";

/**
 * Scripted stand-in for the FFmpeg worker. Each test decides how the worker
 * answers "load" and "export"; every instance is recorded so tests can check
 * that terminated workers are never reused.
 */
type Script = {
  onLoad?: (w: FakeWorker) => void;
  onExport?: (w: FakeWorker, id: string) => void;
};
let script: Script = {};
const workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: { type: string; id?: string; singleThread?: boolean }[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(msg: { type: string; id?: string; singleThread?: boolean }) {
    this.posted.push(msg);
    if (msg.type === "load") queueMicrotask(() => (script.onLoad ?? ((w) => w.emit({ type: "ready", mode: "single" })))(this));
    if (msg.type === "export" || msg.type === "join") queueMicrotask(() => script.onExport?.(this, msg.id!));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    if (!this.terminated) this.onmessage?.({ data } as MessageEvent);
  }
}

const result = (id: string) => ({
  type: "result",
  id,
  data: new ArrayBuffer(8),
  mimeType: "video/mp4",
  size: 8,
  width: 1920,
  height: 1080,
  format: "mp4",
});

const file = () => new File([new Uint8Array(16)], "clip.mp4", { type: "video/mp4" });
const run = (signal?: AbortSignal, onProgress = vi.fn()) =>
  exportVideo(file(), { ...DEFAULT_RECIPE }, onProgress, signal, undefined, undefined, 6);

beforeEach(() => {
  script = {};
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:out"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  terminateFFmpeg();
  resetEnginePreferenceForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dedupeProgress", () => {
  it("only forwards changes of the rounded percentage", () => {
    const cb = vi.fn();
    const p = dedupeProgress(cb)!;
    [0, 0.2, 0.4, 1, 1.3, 1, 2, 2, 150].forEach(p);
    expect(cb.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 100]);
  });
});

describe("FFmpeg client lifecycle", () => {
  it("loads once and reuses the worker across repeated exports", async () => {
    script.onExport = (w, id) => w.emit(result(id));
    await loadFFmpeg();
    const a = await run();
    const b = await run();
    expect(a.size).toBe(8);
    expect(b.size).toBe(8);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.posted.filter((m) => m.type === "load")).toHaveLength(1);
    expect(getFFmpegClientState()).toMatchObject({ hasPendingExport: false, hasPendingProgress: false });
  });

  it("does not accumulate abort listeners over repeated exports", async () => {
    script.onExport = (w, id) => w.emit(result(id));
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    for (let i = 0; i < 5; i++) await run(controller.signal);
    expect(add.mock.calls.length).toBeGreaterThan(0);
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
  });

  it("forwards de-duplicated progress for the active export", async () => {
    script.onExport = (w, id) => {
      [0, 0, 10, 10, 10, 55].forEach((percent) => w.emit({ type: "progress", percent }));
      w.emit(result(id));
    };
    const onProgress = vi.fn();
    await loadFFmpeg();
    await run(undefined, onProgress);
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([0, 10, 55]);
  });

  it("cancelling rejects with AbortError and tells the worker to stop", async () => {
    script.onExport = () => {}; // never finishes on its own
    const controller = new AbortController();
    await loadFFmpeg();
    const pending = run(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.posted.some((m) => m.type === "cancel")).toBe(true);
    expect(getFFmpegClientState().hasPendingExport).toBe(false);
  });

  it("a worker crash fails the export, and the next export gets a fresh worker", async () => {
    script.onExport = (w) => w.onerror?.({ message: "boom" } as ErrorEvent);
    await loadFFmpeg();
    await expect(run()).rejects.toBeInstanceOf(FFmpegLoadError);
    expect(getFFmpegClientState().hasWorker).toBe(false);

    script.onExport = (w, id) => w.emit(result(id));
    const ok = await run();
    expect(ok.size).toBe(8);
    expect(workers).toHaveLength(2);
  });

  it("a failed engine load can be retried", async () => {
    script.onLoad = (w) => w.emit({ type: "error", message: "Failed to fetch" });
    await expect(loadFFmpeg()).rejects.toBeInstanceOf(FFmpegLoadError);

    script.onLoad = undefined;
    script.onExport = (w, id) => w.emit(result(id));
    await loadFFmpeg();
    await expect(run()).resolves.toMatchObject({ format: "mp4" });
  });

  it("terminating during engine load settles the load instead of hanging", async () => {
    script.onLoad = () => {}; // load never completes
    const loading = loadFFmpeg();
    await new Promise((r) => setTimeout(r, 0));
    terminateFFmpeg();
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.terminated).toBe(true);
    expect(getFFmpegClientState()).toEqual({ hasWorker: false, hasPendingExport: false, hasPendingProgress: false });
  });

  it("export results own a blob URL that dispose() revokes", async () => {
    script.onExport = (w, id) => w.emit(result(id));
    const res = await run();
    res.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:out");
  });

  it("records which core the worker actually loaded", async () => {
    script.onLoad = (w) => w.emit({ type: "ready", mode: "multi" });
    expect(getEngineMode()).toBeNull();
    await loadFFmpeg();
    expect(getEngineMode()).toBe("multi");
  });

  it("a worker error without an export id fails the pending export instead of hanging it", async () => {
    script.onExport = (w) => w.emit({ type: "error", message: "unexpected" });
    await loadFFmpeg();
    await expect(run()).rejects.toBeInstanceOf(FFmpegLoadError);
    expect(workers[0]!.terminated).toBe(true);
    expect(getFFmpegClientState()).toEqual({ hasWorker: false, hasPendingExport: false, hasPendingProgress: false });
  });

  it("cancelling during engine load discards the half-loaded worker", async () => {
    script.onLoad = () => {}; // never finishes
    const controller = new AbortController();
    const loading = loadFFmpeg(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.terminated).toBe(true);

    script.onLoad = undefined;
    script.onExport = (w, id) => w.emit(result(id));
    await expect(run()).resolves.toMatchObject({ format: "mp4" });
    expect(workers).toHaveLength(2);
  });

  it("heartbeats keep a slow export alive", async () => {
    vi.useFakeTimers();
    let worker!: FakeWorker;
    let jobId = "";
    script.onExport = (w, id) => {
      worker = w;
      jobId = id;
    };
    const pending = run();
    for (let t = 0; t < STALL_TIMEOUT_MS * 2; t += 10_000) {
      await vi.advanceTimersByTimeAsync(10_000);
      worker?.emit({ type: "heartbeat" });
    }
    worker.emit(result(jobId));
    await expect(pending).resolves.toMatchObject({ size: 8 });
  });

  it("a stalled multi-threaded export is retried automatically on the single-threaded core", async () => {
    vi.useFakeTimers();
    // First worker: multi-threaded and wedged. Second: single-threaded and fine.
    script.onLoad = (w) => w.emit({ type: "ready", mode: workers.length === 1 ? "multi" : "single" });
    script.onExport = (w, id) => {
      if (workers.length > 1) w.emit(result(id));
    };
    const onFallback = vi.fn();
    const onProgress = vi.fn();
    const recipe = { ...DEFAULT_RECIPE, trimStart: 1, trimEnd: 4, speed: 2 };
    const pending = exportVideo(file(), recipe, onProgress, undefined, undefined, undefined, 6, onFallback);
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 5_000);
    await expect(pending).resolves.toMatchObject({ format: "mp4" });

    expect(onFallback).toHaveBeenCalledWith("no_activity");
    expect(workers[0]!.terminated).toBe(true);
    expect(workers[1]!.posted.find((m) => m.type === "load")).toMatchObject({ singleThread: true });
    // The retry is the same export: same edits.
    const exports = workers.flatMap((w) => w.posted).filter((m) => m.type === "export") as unknown as { recipe: unknown }[];
    expect(exports).toHaveLength(2);
    expect(exports[1]!.recipe).toEqual(exports[0]!.recipe);
    expect(exports[1]!.recipe).toMatchObject({ trimStart: 1, trimEnd: 4, speed: 2 });
    expect(onProgress).toHaveBeenCalledWith(0);
  });

  it("if the single-threaded retry stalls too, the export fails with a Retry message", async () => {
    vi.useFakeTimers();
    script.onLoad = (w) => w.emit({ type: "ready", mode: workers.length === 1 ? "multi" : "single" });
    script.onExport = () => {};
    const onFallback = vi.fn();
    const pending = exportVideo(file(), { ...DEFAULT_RECIPE }, vi.fn(), undefined, undefined, undefined, 6, onFallback);
    const assertion = expect(pending).rejects.toMatchObject({ name: "ExportStalledError", mode: "single" });
    await vi.advanceTimersByTimeAsync((STALL_TIMEOUT_MS + 5_000) * 2);
    await assertion;
    expect(onFallback).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow(/Press Retry/);
  });

  it("does not retry a single-threaded stall or a cancelled export", async () => {
    vi.useFakeTimers();
    script.onExport = () => {}; // default load is single-threaded
    const onFallback = vi.fn();
    const pending = exportVideo(file(), { ...DEFAULT_RECIPE }, vi.fn(), undefined, undefined, undefined, 6, onFallback);
    const assertion = expect(pending).rejects.toMatchObject({ mode: "single" });
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 5_000);
    await assertion;
    expect(onFallback).not.toHaveBeenCalled();
    expect(workers).toHaveLength(1);
  });

  it("a stall's message says what happened and to press Retry", async () => {
    vi.useFakeTimers();
    // Single-threaded: a multi-threaded stall would be retried automatically.
    script.onExport = () => {};
    const pending = run();
    const assertion = expect(pending).rejects.toMatchObject({
      reason: "no_activity",
      message: expect.stringMatching(/stopped responding\. Press Retry/),
    });
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 5_000);
    await assertion;
  });

  it("fails an export that keeps logging but encodes nothing new (stuck at 100%)", async () => {
    vi.useFakeTimers();
    let worker!: FakeWorker;
    script.onExport = (w) => {
      worker = w;
      w.emit({ type: "progress", percent: 99, outputSeconds: 5.9 });
    };
    const pending = run();
    const assertion = expect(pending).rejects.toMatchObject({ name: "ExportStalledError", reason: "no_progress" });
    for (let t = 0; t <= NO_PROGRESS_TIMEOUT_MS; t += 10_000) {
      await vi.advanceTimersByTimeAsync(10_000);
      worker?.emit({ type: "heartbeat" });
      worker?.emit({ type: "progress", percent: 99, outputSeconds: 5.9 });
    }
    await assertion;
    expect(workers[0]!.terminated).toBe(true);
  });

  it("keeps a long export alive while encoded time keeps advancing", async () => {
    vi.useFakeTimers();
    let worker!: FakeWorker;
    let jobId = "";
    script.onExport = (w, id) => {
      worker = w;
      jobId = id;
    };
    const pending = exportVideo(file(), { ...DEFAULT_RECIPE }, vi.fn(), undefined, undefined, undefined, 600);
    for (let t = 1; t <= 30; t++) {
      await vi.advanceTimersByTimeAsync(10_000);
      worker?.emit({ type: "progress", percent: Math.round((t * 10 * 100) / 600), outputSeconds: t * 10 });
    }
    worker.emit(result(jobId));
    await expect(pending).resolves.toMatchObject({ size: 8 });
  });

  it("without encoded-time reports, only silence counts as a stall", async () => {
    vi.useFakeTimers();
    let worker!: FakeWorker;
    let jobId = "";
    script.onExport = (w, id) => {
      worker = w;
      jobId = id;
    };
    const pending = run();
    for (let t = 0; t < NO_PROGRESS_TIMEOUT_MS * 2; t += 10_000) {
      await vi.advanceTimersByTimeAsync(10_000);
      worker?.emit({ type: "progress", percent: 0 });
    }
    worker.emit(result(jobId));
    await expect(pending).resolves.toMatchObject({ size: 8 });
  });

  it("fails an export that runs far past the clip's length", async () => {
    vi.useFakeTimers();
    script.onExport = (w) => {
      // A 6 s clip; looped music without -t would keep going like this.
      [3, 6, 12, 30].forEach((outputSeconds) => w.emit({ type: "progress", percent: 99, outputSeconds }));
    };
    const pending = run();
    const assertion = expect(pending).rejects.toMatchObject({ reason: "overrun" });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("never posts a non-finite duration to the worker", async () => {
    // jsdom never loads media, so the fallback metadata read times out (5 s).
    vi.useFakeTimers();
    script.onExport = (w, id) => w.emit(result(id));
    for (const knownDuration of [Infinity, NaN, -1, 0]) {
      const pending = exportVideo(file(), { ...DEFAULT_RECIPE }, vi.fn(), undefined, undefined, undefined, knownDuration);
      await vi.advanceTimersByTimeAsync(6_000);
      await pending;
    }
    const durations = workers.flatMap((w) => w.posted).filter((m) => m.type === "export").map((m) => (m as { videoDuration?: number }).videoDuration);
    expect(durations).toHaveLength(4);
    for (const d of durations) expect(Number.isFinite(d)).toBe(true);
  });
});

describe("overrunLimitSeconds", () => {
  it("allows a margin over the expected length", () => {
    expect(overrunLimitSeconds(6)).toBeGreaterThan(6);
    expect(overrunLimitSeconds(600)).toBeGreaterThan(700);
  });
});

describe("sharing the engine load", () => {
  it("a filmstrip cancelled during the load doesn't take the engine from an export waiting on it", async () => {
    let worker: FakeWorker | null = null;
    script.onLoad = (w) => (worker = w); // the load is still in progress
    script.onExport = (w, id) => w.emit(result(id));
    const frames = new AbortController();
    const framesDone = extractFrames(file(), [1], 160, vi.fn(), frames.signal).catch((e) => e);
    await vi.waitFor(() => expect(worker).not.toBeNull());
    const exported = run();
    // Starting the export pauses the filmstrip.
    frames.abort();
    worker!.emit({ type: "ready", mode: "single" });
    await expect(exported).resolves.toMatchObject({ size: 8 });
    expect((await framesDone).name).toBe("AbortError");
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
  });
});

describe("joinClips", () => {
  it("sends the clips to the worker as a join and resolves with the joined video", async () => {
    script.onExport = (w, id) => w.emit(result(id));
    const clips = [
      { file: file(), duration: 4 },
      { file: file(), duration: Infinity },
    ];
    const joined = await joinClips(clips, 1280, 720, vi.fn());
    expect(joined.size).toBe(8);
    const message = workers[0]!.posted.find((m) => m.type === "join") as unknown as {
      clips: { duration: number }[];
      width: number;
      height: number;
    };
    // An unusable length goes as 0 ("unknown"), never Infinity.
    expect(message.clips.map((c) => c.duration)).toEqual([4, 0]);
    expect([message.width, message.height]).toEqual([1280, 720]);
  });
});
