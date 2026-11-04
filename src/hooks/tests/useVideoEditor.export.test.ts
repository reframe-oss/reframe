import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useVideoEditor } from "../useVideoEditor";
import { loadFFmpeg, exportVideo, terminateFFmpeg, ExportStalledError } from "@/lib/ffmpeg";

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

const okResult = {
  blobUrl: "blob:result",
  blob: new Blob(),
  size: 1000,
  width: 1920,
  height: 1080,
  format: "mp4" as const,
  dispose: () => {},
};

// jsdom has no media pipeline: make <video> report metadata as soon as a src is set.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    configurable: true,
    get() {
      return (this as { _src?: string })._src ?? "";
    },
    set(this: HTMLVideoElement & { _src?: string }, v: string) {
      this._src = v;
      setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 12 });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.mocked(loadFFmpeg).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/** An MP4 whose first bytes contain the `ftyp` box the magic-byte check looks for. */
function mp4File() {
  const bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return new File([bytes], "clip.mp4", { type: "video/mp4" });
}

async function editorWithFile() {
  const hook = renderHook(() => useVideoEditor());
  act(() => hook.result.current.handleFileSelect(mp4File()));
  await waitFor(() => expect(hook.result.current.file).not.toBeNull());
  return hook;
}

describe("useVideoEditor export lifecycle", () => {
  it("a failed export keeps the user's settings, restarts the engine, and can be retried", async () => {
    const { result } = await editorWithFile();
    act(() => result.current.updateRecipe({ speed: 2, brightness: 0.3 }));

    vi.mocked(exportVideo).mockRejectedValueOnce(new Error("ffmpeg exited with code 1"));
    await act(() => result.current.handleExport());

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/settings are kept/i);
    expect(result.current.recipe.speed).toBe(2);
    expect(result.current.recipe.brightness).toBe(0.3);
    expect(terminateFFmpeg).toHaveBeenCalledTimes(1);

    vi.mocked(exportVideo).mockResolvedValueOnce(okResult);
    await act(() => result.current.handleExport());
    expect(result.current.status).toBe("done");
    expect(result.current.error).toBeNull();
    expect(result.current.result?.size).toBe(1000);
  });

  it("a stalled multi-threaded export ends in an actionable error, not a frozen 0%", async () => {
    const { result } = await editorWithFile();
    vi.mocked(exportVideo).mockRejectedValueOnce(new ExportStalledError("multi"));
    await act(() => result.current.handleExport());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/single-threaded/i);
    expect(result.current.error).toMatch(/retry export/i);
    expect(terminateFFmpeg).toHaveBeenCalled();

    vi.mocked(exportVideo).mockResolvedValueOnce(okResult);
    await act(() => result.current.handleExport());
    expect(result.current.status).toBe("done");
  });

  it("starts the encode phase at 0% even though engine load reported 100%", async () => {
    const { result } = await editorWithFile();
    vi.mocked(loadFFmpeg).mockImplementationOnce(async (_signal, onProgress) => {
      onProgress?.(100);
    });
    vi.mocked(exportVideo).mockImplementationOnce(() => new Promise(() => {}));
    act(() => {
      void result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("exporting"));
    expect(result.current.progress).toBe(0);
  });

  it("passes the already-known duration so export skips a second metadata read", async () => {
    const { result } = await editorWithFile();
    vi.mocked(exportVideo).mockResolvedValueOnce(okResult);
    await act(() => result.current.handleExport());
    const args = vi.mocked(exportVideo).mock.calls[0]!;
    expect(args[6]).toBe(12);
  });

  it("cancelling returns to idle without touching the recipe", async () => {
    const { result } = await editorWithFile();
    act(() => result.current.updateRecipe({ format: "webm" }));
    vi.mocked(exportVideo).mockImplementationOnce(() => new Promise(() => {})); // never settles

    act(() => {
      void result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("exporting"));
    act(() => result.current.cancelExport());

    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.recipe.format).toBe("webm");
    expect(terminateFFmpeg).toHaveBeenCalled();
  });

  it("a cancelled export that later rejects doesn't surface an error", async () => {
    const { result } = await editorWithFile();
    let reject!: (e: unknown) => void;
    vi.mocked(exportVideo).mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    let done!: Promise<void>;
    act(() => {
      done = result.current.handleExport();
    });
    await waitFor(() => expect(result.current.status).toBe("exporting"));
    act(() => result.current.cancelExport());
    await act(async () => {
      reject(new DOMException("Export cancelled", "AbortError"));
      await done;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("exposes the playhead on demand instead of as per-frame state", () => {
    const { result } = renderHook(() => useVideoEditor());
    expect(result.current.getCurrentTime()).toBe(0);
    expect("currentTime" in result.current).toBe(false);
  });
});

describe("useVideoEditor URL sync", () => {
  it("debounces history.replaceState across rapid recipe changes", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useVideoEditor());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    spy.mockClear();

    for (let i = 1; i <= 10; i++) {
      act(() => result.current.updateRecipe({ brightness: i / 10 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
    }
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("brightness=1");
    spy.mockRestore();
  });

  it("never writes array fields such as textOverlays into the URL", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVideoEditor());
    act(() =>
      result.current.updateRecipe({
        textOverlays: [{ id: "t1", text: "Hi", x: 50, y: 50, fontSize: 24, color: "#fff", fontWeight: "bold" }],
      })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(window.location.search).not.toContain("textOverlays");
  });
});
