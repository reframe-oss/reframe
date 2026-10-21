import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadFFmpeg,
  exportVideo,
  terminateFFmpeg,
  dedupeProgress,
  getFFmpegClientState,
  FFmpegLoadError,
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
  posted: { type: string; id?: string }[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(msg: { type: string; id?: string }) {
    this.posted.push(msg);
    if (msg.type === "load") queueMicrotask(() => (script.onLoad ?? ((w) => w.emit({ type: "ready" })))(this));
    if (msg.type === "export") queueMicrotask(() => script.onExport?.(this, msg.id!));
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
});
