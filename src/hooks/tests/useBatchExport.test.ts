import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ exportVideo: vi.fn(), trackFeature: vi.fn() }));
vi.mock("@/lib/ffmpeg", () => ({ exportVideo: m.exportVideo }));
vi.mock("@/lib/featureTelemetry", () => ({ trackFeature: m.trackFeature }));
vi.mock("@/hooks/useVideoEditor", () => ({
  extractMetadata: async () => ({ width: 1280, height: 720, duration: 10 }),
  describeExportError: (err: unknown) => `failed: ${(err as Error).message}`,
}));

import { useBatchExport } from "../useBatchExport";
import { DEFAULT_RECIPE } from "@/lib/constants";

const video = (name: string) => new File([new Uint8Array(4)], name, { type: "video/mp4" });
const settings = {
  recipe: { ...DEFAULT_RECIPE, trimStart: 2, trimEnd: 5 },
  music: { file: null, musicVolume: 50, originalAudioVolume: 100, loopMusic: false },
  overlay: { file: null, position: "top-right" as const, size: 100, opacity: 100 },
};
const result = () => ({ blobUrl: "blob:out", blob: new Blob(["x"]), size: 1, width: 1, height: 1, format: "mp4" as const, dispose: vi.fn() });

beforeEach(() => {
  m.exportVideo.mockReset();
  m.trackFeature.mockReset();
});

describe("useBatchExport", () => {
  it("exports each video in turn with the trim reset, and reports done", async () => {
    const order: string[] = [];
    m.exportVideo.mockImplementation(async (file: File, recipe, onProgress: (p: number) => void) => {
      order.push(file.name);
      expect(recipe).toMatchObject({ trimStart: 0, trimEnd: null });
      onProgress(50);
      return result();
    });
    const { result: hook } = renderHook(() => useBatchExport());
    act(() => hook.current.add([video("a.mp4"), video("b.mp4")]));
    await act(() => hook.current.start(settings));
    expect(order).toEqual(["a.mp4", "b.mp4"]);
    expect(hook.current.items.map((i) => i.status)).toEqual(["done", "done"]);
    expect(m.exportVideo.mock.calls[0]![6]).toBe(10); // the probed duration
    expect(m.trackFeature).toHaveBeenCalledWith("batch_export", "done");
    expect(hook.current.running).toBe(false);
  });

  it("keeps going after a failure, and retries only what didn't finish", async () => {
    m.exportVideo.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(result());
    const { result: hook } = renderHook(() => useBatchExport());
    act(() => hook.current.add([video("a.mp4"), video("b.mp4")]));
    await act(() => hook.current.start(settings));
    expect(hook.current.items.map((i) => i.status)).toEqual(["failed", "done"]);
    expect(hook.current.items[0]!.error).toBe("failed: boom");
    expect(m.trackFeature).toHaveBeenCalledWith("batch_export", "done_with_failures");

    await act(() => hook.current.start(settings));
    expect(m.exportVideo).toHaveBeenCalledTimes(3);
    expect(hook.current.items.map((i) => i.status)).toEqual(["done", "done"]);
  });

  it("cancel stops the running export and marks the rest cancelled", async () => {
    m.exportVideo.mockImplementation(
      (_f: File, _r: unknown, _p: unknown, signal: AbortSignal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))))
    );
    const { result: hook } = renderHook(() => useBatchExport());
    act(() => hook.current.add([video("a.mp4"), video("b.mp4")]));
    let run!: Promise<void>;
    act(() => {
      run = hook.current.start(settings);
    });
    await waitFor(() => expect(hook.current.items[0]!.status).toBe("exporting"));
    await act(async () => {
      hook.current.cancel();
      await run;
    });
    expect(hook.current.items.map((i) => i.status)).toEqual(["cancelled", "cancelled"]);
    expect(m.exportVideo).toHaveBeenCalledTimes(1);
    expect(m.trackFeature).toHaveBeenCalledWith("batch_export", "cancel");
  });

  it("skips files that aren't videos and caps the list", () => {
    const { result: hook } = renderHook(() => useBatchExport());
    act(() => hook.current.add([video("a.mp4"), new File(["x"], "notes.txt", { type: "text/plain" })]));
    expect(hook.current.items).toHaveLength(1);
    expect(hook.current.notice).toMatch(/isn't a video/);
    act(() => hook.current.add(Array.from({ length: 60 }, (_, i) => video(`${i}.mp4`))));
    expect(hook.current.items).toHaveLength(50);
    expect(hook.current.notice).toMatch(/up to 50/);
  });

  it("frees results when they're removed or cleared", async () => {
    const results = [result(), result()];
    m.exportVideo.mockResolvedValueOnce(results[0]).mockResolvedValueOnce(results[1]);
    const { result: hook } = renderHook(() => useBatchExport());
    act(() => hook.current.add([video("a.mp4"), video("b.mp4")]));
    await act(() => hook.current.start(settings));
    act(() => hook.current.remove(hook.current.items[0]!.id));
    expect(results[0]!.dispose).toHaveBeenCalled();
    act(() => hook.current.clear());
    expect(results[1]!.dispose).toHaveBeenCalled();
    expect(hook.current.items).toEqual([]);
  });
});
