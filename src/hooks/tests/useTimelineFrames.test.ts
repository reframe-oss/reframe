import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  extractFrames: vi.fn(),
  getCachedFrames: vi.fn(),
  putCachedFrames: vi.fn(),
}));

vi.mock("@/lib/ffmpeg", () => {
  class EngineBusyError extends Error {}
  return { EngineBusyError, extractFrames: m.extractFrames };
});
vi.mock("@/lib/frameCache", () => ({
  fileFingerprint: async () => "fp",
  frameCacheKey: (fp: string, times: number[], width: number) => `${fp}:${width}:${times.length}`,
  getCachedFrames: m.getCachedFrames,
  putCachedFrames: m.putCachedFrames,
}));
vi.mock("@/lib/telemetry", () => ({ trackVital: vi.fn() }));

import { useTimelineFrames, timelineFrameTimes, TIMELINE_FRAME_COUNT } from "../useTimelineFrames";
import { EngineBusyError } from "@/lib/ffmpeg";

const file = new File([new Uint8Array(4)], "clip.mp4");
const blob = new Blob([new Uint8Array(1)], { type: "image/jpeg" });

beforeEach(() => {
  m.extractFrames.mockReset();
  m.getCachedFrames.mockReset().mockResolvedValue(null);
  m.putCachedFrames.mockReset().mockResolvedValue(undefined);
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:${n++}`);
  URL.revokeObjectURL = vi.fn();
});

const makeAll = () =>
  m.extractFrames.mockImplementation(async (_f: File, times: number[], _w: number, onFrame: (f: unknown) => void) => {
    times.forEach((time, index) => onFrame({ index, time, blob }));
    return 0;
  });

describe("timelineFrameTimes", () => {
  it("puts one frame in the middle of each slot, even for short or odd lengths", () => {
    expect(timelineFrameTimes(16)).toEqual(Array.from({ length: 16 }, (_, i) => i + 0.5));
    expect(timelineFrameTimes(10)).toHaveLength(16);
    expect(new Set(timelineFrameTimes(10)).size).toBe(16);
    expect(Math.max(...timelineFrameTimes(0.4, 4))).toBeLessThan(0.4);
    expect(timelineFrameTimes(0)).toEqual([]);
    expect(timelineFrameTimes(Number.NaN)).toEqual([]);
  });
});

describe("useTimelineFrames", () => {
  it("makes one frame per slot with FFmpeg, then caches them", async () => {
    makeAll();
    const { result } = renderHook(() => useTimelineFrames(file, 32, false));
    expect(result.current.times).toHaveLength(TIMELINE_FRAME_COUNT);
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.source).toBe("engine");
    expect(result.current.frames.filter(Boolean)).toHaveLength(TIMELINE_FRAME_COUNT);
    expect(m.putCachedFrames).toHaveBeenCalledWith("fp:160:16", expect.any(Array));
  });

  it("uses cached frames without running FFmpeg", async () => {
    const times = [0, 2, 4];
    m.getCachedFrames.mockImplementation(async () => times.map((time) => ({ time, blob })));
    const { result } = renderHook(() => useTimelineFrames(file, 32, false));
    await waitFor(() => expect(result.current.source).toBe("cache"));
    expect(m.extractFrames).not.toHaveBeenCalled();
  });

  it("waits while an export owns the engine and resumes after it", async () => {
    makeAll();
    const { result, rerender } = renderHook(({ busy }) => useTimelineFrames(file, 32, busy), { initialProps: { busy: true } });
    await new Promise((r) => setTimeout(r, 400));
    expect(m.extractFrames).not.toHaveBeenCalled();
    rerender({ busy: false });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("an engine-busy refusal is retried later, not shown as a failure", async () => {
    m.extractFrames.mockRejectedValueOnce(new EngineBusyError("busy"));
    const { result, rerender } = renderHook(({ busy }) => useTimelineFrames(file, 32, busy), { initialProps: { busy: false } });
    await waitFor(() => expect(m.extractFrames).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("loading");
    makeAll();
    rerender({ busy: true });
    rerender({ busy: false });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("reports unavailable when FFmpeg can't make frames", async () => {
    m.extractFrames.mockRejectedValue(new Error("engine failed"));
    const { result } = renderHook(() => useTimelineFrames(file, 32, false));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("frees the old strip's URLs when the video changes", async () => {
    makeAll();
    const { result, rerender } = renderHook(({ f }) => useTimelineFrames(f, 32, false), { initialProps: { f: file } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ f: new File([new Uint8Array(4)], "other.mp4") });
    expect(result.current.frames).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(TIMELINE_FRAME_COUNT);
  });

  it("does nothing without a video", () => {
    const { result } = renderHook(() => useTimelineFrames(null, 0, false));
    expect(result.current).toMatchObject({ times: [], frames: [], status: "idle" });
  });
});
