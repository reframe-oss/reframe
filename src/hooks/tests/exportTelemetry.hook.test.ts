import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { DatadogRum } from "@datadog/browser-rum";
import { useVideoEditor } from "../useVideoEditor";
import { loadFFmpeg, exportVideo, FFmpegLoadError } from "@/lib/ffmpeg";
import { HANDLED_ERROR_PREFIX, registerRum, resetTelemetryForTests } from "@/lib/telemetry";

// Real error classes, mocked engine.
vi.mock("@/lib/ffmpeg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ffmpeg")>()),
  loadFFmpeg: vi.fn(),
  exportVideo: vi.fn(),
  terminateFFmpeg: vi.fn(),
  getEngineMode: vi.fn(() => "multi"),
}));
vi.mock("@/lib/sessionDB", () => ({
  saveSessionFile: vi.fn().mockResolvedValue(undefined),
  loadSessionFile: vi.fn().mockResolvedValue(null),
  clearSessionFile: vi.fn().mockResolvedValue(undefined),
}));

const okResult = { blobUrl: "blob:result", blob: new Blob(), size: 1000, width: 1920, height: 1080, format: "mp4" as const, dispose() {} };

// jsdom has no media pipeline: report metadata as soon as a src is set.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    configurable: true,
    get: () => "",
    set(this: HTMLVideoElement) {
      setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 12 });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

let rum: { addAction: ReturnType<typeof vi.fn>; addDurationVital: ReturnType<typeof vi.fn> };
const lifecycle = () =>
  rum.addAction.mock.calls
    .map(([name, ctx]) => ({ name: name as string, ctx: ctx as Record<string, unknown> }))
    .filter((e) => e.name.startsWith("export_"));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.mocked(loadFFmpeg).mockResolvedValue(undefined);
  resetTelemetryForTests();
  vi.stubEnv("NEXT_PUBLIC_DATADOG_APPLICATION_ID", "app");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_CLIENT_TOKEN", "token");
  vi.stubEnv("NEXT_PUBLIC_DATADOG_ENV", "unit-test");
  rum = { addAction: vi.fn(), addDurationVital: vi.fn() };
  registerRum(rum as unknown as DatadogRum);
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetTelemetryForTests();
});

const mp4 = () =>
  new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "holiday-clip.mp4", { type: "video/mp4" });

async function editorWithFile() {
  const hook = renderHook(() => useVideoEditor());
  act(() => hook.result.current.handleFileSelect(mp4()));
  await waitFor(() => expect(hook.result.current.file).not.toBeNull());
  return hook;
}

describe("export reliability telemetry in the editor", () => {
  it("reports each export's outcome with bounded context, and whether a retry recovered", async () => {
    const { result } = await editorWithFile();
    vi.mocked(exportVideo).mockRejectedValueOnce(new Error("RuntimeError: memory access out of bounds"));
    await act(() => result.current.handleExport());
    vi.mocked(exportVideo).mockResolvedValueOnce(okResult);
    await act(() => result.current.handleExport());

    expect(lifecycle().map((e) => [e.name, e.ctx.is_retry, e.ctx.category ?? e.ctx.retry_after ?? null])).toEqual([
      ["export_started", false, null],
      ["export_failed", false, "encoder_crash"],
      ["export_started", true, "encoder_crash"],
      ["export_succeeded", true, null],
    ]);
    expect(lifecycle()[1]!.ctx).toMatchObject({ format: "mp4", resolution: "1080p", engine: "multi", stage: "encode" });
    // Never the file name or caption text.
    expect(JSON.stringify(rum.addAction.mock.calls)).not.toContain("holiday-clip");
  });

  it("an automatic fallback to the single-threaded engine is one attempt, with a notice", async () => {
    const { result } = await editorWithFile();
    vi.mocked(exportVideo).mockImplementationOnce(async (...args) => {
      const onEngineFallback = args[7] as (reason: "no_activity") => void;
      onEngineFallback("no_activity");
      return okResult;
    });
    await act(() => result.current.handleExport());
    expect(lifecycle().map((e) => e.name)).toEqual(["export_started", "export_succeeded"]);
    const fallback = rum.addAction.mock.calls.find(([name]) => name === "engine_fallback");
    expect(fallback?.[1]).toMatchObject({ stall_reason: "no_activity", from: "multi", to: "single" });
    expect(lifecycle()[1]!.ctx).toMatchObject({ engine: "single", fell_back: true });
    expect(result.current.exportNotice).toMatch(/single-threaded engine/);
    // The editor passes its known duration, so the export doesn't re-read it.
    expect(vi.mocked(exportVideo).mock.calls[0]![6]).toBe(12);
  });

  it("a cancel followed by a late rejection is one cancellation, not a failure", async () => {
    const { result } = await editorWithFile();
    let reject!: (e: unknown) => void;
    vi.mocked(exportVideo).mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    let done!: Promise<void>;
    act(() => {
      done = result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("exporting"));
    act(() => result.current.cancelExport());
    act(() => result.current.cancelExport());
    await act(async () => {
      reject(new Error("ffmpeg exited with code 255"));
      await done;
    });
    expect(lifecycle().map((e) => e.name)).toEqual(["export_started", "export_cancelled"]);
    expect(lifecycle()[1]!.ctx).toMatchObject({ stage: "encode" });
  });

  it("cancelling while the engine loads is reported at the engine stage", async () => {
    const { result } = await editorWithFile();
    vi.mocked(loadFFmpeg).mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      void result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("loading-engine"));
    act(() => result.current.cancelExport());
    expect(lifecycle().map((e) => [e.name, e.ctx.stage ?? null])).toEqual([
      ["export_started", null],
      ["export_cancelled", "engine"],
    ]);
  });

  it("an engine that can't start is an engine_load failure", async () => {
    const { result } = await editorWithFile();
    vi.mocked(loadFFmpeg).mockRejectedValueOnce(new FFmpegLoadError("Failed to fetch engine file (HTTP 503)"));
    await act(() => result.current.handleExport());
    expect(lifecycle().at(-1)).toMatchObject({ name: "export_failed", ctx: { stage: "engine", category: "engine_load" } });
  });

  it("logs handled failures with the prefix RUM's console collection drops", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await editorWithFile();
    vi.mocked(exportVideo).mockRejectedValueOnce(new Error("ffmpeg exited with code 1"));
    await act(() => result.current.handleExport());
    expect(spy.mock.calls.some(([first]) => String(first).startsWith(HANDLED_ERROR_PREFIX))).toBe(true);
    spy.mockRestore();
  });
});
