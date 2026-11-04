"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EngineBusyError, extractFrames } from "@/lib/ffmpeg";
import { fileFingerprint, frameCacheKey, getCachedFrames, putCachedFrames, type CachedFrame } from "@/lib/frameCache";
import { trackVital } from "@/lib/telemetry";

/** Frames across the trim timeline, and their width in pixels (about 16:9). */
export const TIMELINE_FRAME_COUNT = 16;
export const TIMELINE_FRAME_WIDTH = 160;

export interface TimelineFrameView {
  time: number;
  url: string;
}

export interface TimelineFrames {
  /** The times the strip shows, so empty slots can be drawn before frames arrive. */
  times: number[];
  /** Frames ready so far, by index into `times` (sparse while loading). */
  frames: (TimelineFrameView | undefined)[];
  status: "idle" | "loading" | "ready" | "unavailable";
  /** Where the frames came from: this browser's cache or FFmpeg. */
  source: "cache" | "engine" | null;
}

/**
 * One time per slot of the strip, at the middle of each slot, so every slot
 * shows the part of the video under it. Rounded to milliseconds, and never
 * past the last frame.
 */
export function timelineFrameTimes(duration: number, count = TIMELINE_FRAME_COUNT): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return [];
  const last = Math.max(0, duration - 0.05);
  return Array.from({ length: count }, (_, i) => Number(Math.min(last, ((i + 0.5) * duration) / count).toFixed(3)));
}

const whenIdle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(fn, 300);
  return () => window.clearTimeout(handle);
};

/**
 * Filmstrip frames for the trim timeline, made by FFmpeg in its worker (off
 * the main thread) and cached in this browser. Starts once the browser is
 * idle, so the preview shows first. While `busy` (an export owns the engine)
 * it waits, and it resumes afterwards if the strip wasn't finished.
 */
export function useTimelineFrames(file: File | null, duration: number, busy: boolean): TimelineFrames {
  const times = useMemo(
    () => (file ? timelineFrameTimes(duration) : []),
    [file, duration]
  );
  // `for` ties the state to one strip: a new video starts from empty without
  // an effect resetting state.
  const [state, setState] = useState<Omit<TimelineFrames, "times"> & { for: number[] }>({
    for: [],
    frames: [],
    status: "idle",
    source: null,
  });
  /** Object URLs for the current strip, and whether it is finished. */
  const strip = useRef<{ urls: string[]; complete: boolean }>({ urls: [], complete: false });

  // A new video (or length): start a new strip and free the old one's URLs.
  useEffect(() => {
    const current = { urls: [] as string[], complete: false };
    strip.current = current;
    return () => current.urls.forEach((url) => URL.revokeObjectURL(url));
  }, [times]);

  useEffect(() => {
    const current = strip.current;
    if (!file || times.length === 0 || busy || current.complete) return;
    const controller = new AbortController();

    const show = (index: number, frame: CachedFrame) => {
      if (controller.signal.aborted || index < 0) return;
      const url = URL.createObjectURL(frame.blob);
      current.urls.push(url);
      setState((prev) => {
        const frames = prev.for === times ? prev.frames.slice() : [];
        frames[index] = { time: frame.time, url };
        return { for: times, status: prev.for === times ? prev.status : "loading", source: prev.for === times ? prev.source : null, frames };
      });
    };

    const run = async () => {
      const startedAt = performance.now();
      let key: string | null = null;
      try {
        key = frameCacheKey(await fileFingerprint(file), times, TIMELINE_FRAME_WIDTH);
        const cached = await getCachedFrames(key);
        if (controller.signal.aborted) return;
        if (cached?.length) {
          cached.forEach((frame) => show(times.indexOf(frame.time), frame));
          current.complete = true;
          setState((prev) => ({ ...prev, for: times, status: "ready", source: "cache" }));
          return;
        }
      } catch {
        // Fingerprinting or storage failed: just make the frames.
      }

      const made: CachedFrame[] = [];
      try {
        await extractFrames(
          file,
          times,
          TIMELINE_FRAME_WIDTH,
          (frame) => {
            made.push({ time: frame.time, blob: frame.blob });
            show(frame.index, frame);
          },
          controller.signal
        );
        current.complete = true;
        setState((prev) => ({ ...prev, for: times, status: "ready", source: "engine" }));
        trackVital("timeline_frames", startedAt, { frames: String(made.length) });
        if (key && made.length) void putCachedFrames(key, made);
      } catch (error) {
        if (controller.signal.aborted) return;
        const name = (error as { name?: string } | null)?.name;
        // An export took the engine; this runs again once it's done.
        if (error instanceof EngineBusyError || name === "AbortError") return;
        setState((prev) =>
          prev.for === times
            ? { ...prev, status: prev.frames.some(Boolean) ? "ready" : "unavailable" }
            : { for: times, frames: [], status: "unavailable", source: null }
        );
      }
    };

    const cancelIdle = whenIdle(() => void run());
    return () => {
      cancelIdle();
      controller.abort();
    };
  }, [file, times, busy]);

  if (state.for !== times) return { times, frames: [], status: times.length ? "loading" : "idle", source: null };
  return { times, frames: state.frames, status: state.status, source: state.source };
}
