"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  computeThumbnailTimes,
  generateThumbnails,
  pickThumbnailInterval,
  type ThumbnailFrame,
} from "@/lib/thumbnails";
import { trackAction, trackDuration } from "@/lib/telemetry";

interface ThumbnailStripProps {
  videoSrc: string | null;
  duration: number;
  /**
   * The preview <video>. The strip listens to it directly for the playhead
   * position instead of receiving `currentTime` as a prop — that prop used to
   * re-render the whole editor on every `timeupdate` during playback.
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
  trimStart?: number;
  trimEnd?: number;
  onSeek: (time: number) => void;
  intervalSeconds?: number;
}

type GenerationState =
  | { status: "idle" }
  | { status: "generating"; completed: number; total: number }
  | { status: "done"; skipped: number }
  | { status: "error" };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Index of the last frame at or before `time` (frames are sorted by time). */
export function findActiveFrameIndex(frames: { time: number }[], time: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((frames[mid]?.time ?? Infinity) <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function ThumbnailStrip({
  videoSrc,
  duration,
  videoRef,
  trimStart = 0,
  trimEnd,
  onSeek,
  intervalSeconds,
}: ThumbnailStripProps) {
  const [frames, setFrames] = useState<ThumbnailFrame[]>([]);
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  const [attempt, setAttempt] = useState(0);
  const framesRef = useRef<ThumbnailFrame[]>([]);

  const effectiveTrimEnd = trimEnd ?? duration;
  const interval = intervalSeconds ?? pickThumbnailInterval(duration);

  // Generate frames. Re-runs only when the source, duration or interval
  // changes — never on editing-slider changes.
  useEffect(() => {
    if (!videoSrc || duration <= 0) return;

    const controller = new AbortController();
    const times = computeThumbnailTimes(duration, interval);
    const startedAt = performance.now();
    // Genuinely needs an effect: drives async canvas/video capture work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrames([]);
    setState({ status: "generating", completed: 0, total: times.length });

    generateThumbnails(videoSrc, times, {
      signal: controller.signal,
      onBatch: (batch, completed, total) => {
        if (controller.signal.aborted) return;
        setFrames(batch);
        setState({ status: "generating", completed, total });
      },
    })
      .then(({ frames: result, skipped }) => {
        if (controller.signal.aborted) {
          result.forEach((f) => URL.revokeObjectURL(f.url));
          return;
        }
        framesRef.current = result;
        setFrames(result);
        setState({ status: "done", skipped });
        trackDuration("thumbnails_generated", startedAt, {
          frames: result.length,
          skipped,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFrames([]);
        setState({ status: "error" });
        trackAction("thumbnails_failed", {
          reason: err instanceof Error && /timed out/i.test(err.message) ? "timeout" : "decode",
        });
      });

    return () => {
      controller.abort();
      // Release frames from the previous source; aborted in-flight batches
      // are revoked by generateThumbnails itself.
      framesRef.current.forEach((f) => URL.revokeObjectURL(f.url));
      framesRef.current = [];
    };
  }, [videoSrc, duration, interval, attempt]);

  // Playhead: update state only when the active frame actually changes.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video || frames.length === 0) return;
    // Compared against a ref so an unchanged index never calls setState
    // (a functional updater returning the same value can still re-render).
    const sync = () => {
      const next = findActiveFrameIndex(frames, video.currentTime);
      if (next === activeIndexRef.current) return;
      activeIndexRef.current = next;
      setActiveIndex(next);
    };
    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [videoRef, frames]);

  if (!videoSrc) return null;

  const generating = state.status === "generating";
  const percent =
    state.status === "generating" && state.total > 0
      ? Math.round((state.completed / state.total) * 100)
      : 0;

  return (
    <section aria-label="Frame previews" className="w-full">
      <div className="flex items-center gap-3 pb-2">
        <h3 className="marker text-sm">
          <span aria-hidden="true">(</span>Frames<span aria-hidden="true">)</span>
        </h3>
        {generating && (
          <div className="flex flex-1 items-center gap-2" aria-live="polite">
            <div
              className="progress-track h-1 max-w-[160px]"
              role="progressbar"
              aria-label="Generating frame previews"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
            <span className="tabular text-2xs text-[var(--muted)]">{percent}%</span>
          </div>
        )}
        {state.status === "done" && frames.length > 0 && (
          <span className="tabular ml-auto text-2xs text-[var(--muted)]">
            {frames.length} frames, every {Math.round(interval)}s
            {state.skipped > 0 && ` (${state.skipped} skipped)`}
          </span>
        )}
      </div>

      {state.status === "error" ? (
        <div className="callout callout-info items-center justify-between text-xs">
          <span>Frame previews couldn&apos;t be generated for this file. Playback and export still work.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
          <div className="flex gap-1">
            {frames.length === 0 &&
              generating &&
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="h-[54px] w-24 shrink-0 rounded-[3px] bg-[var(--surface-2)]"
                />
              ))}
            {frames.map((thumb, i) => {
              const isActive = i === activeIndex;
              const inTrimRange = thumb.time >= trimStart && thumb.time <= effectiveTrimEnd;
              const label = `Seek to ${formatTime(thumb.time)}`;
              return (
                <button
                  key={thumb.time}
                  type="button"
                  onClick={() => onSeek(thumb.time)}
                  aria-label={label}
                  aria-current={isActive ? "true" : undefined}
                  title={label}
                  className={cn(
                    "group relative h-[54px] w-24 shrink-0 overflow-hidden rounded-[3px] border-2 bg-[var(--viewer)]",
                    "transition-[border-color] duration-fast",
                    // Red marks the playhead frame, as it marks the playhead elsewhere.
                    isActive ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--border-strong)]"
                  )}
                >
                  <Image
                    src={thumb.url}
                    alt=""
                    width={160}
                    height={90}
                    unoptimized
                    draggable={false}
                    className={cn(
                      // Hover-only zoom on the thumbnail image; nothing animates
                      // during playback except the active border colour.
                      "h-full w-full object-cover transition-transform duration-base ease-out group-hover:scale-[1.06]",
                      !inTrimRange && "opacity-35 grayscale"
                    )}
                  />
                  <span className="tabular pointer-events-none absolute bottom-0.5 left-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">
                    {formatTime(thumb.time)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// Memoised: the parent re-renders on every recipe change (slider drags), but
// the strip only cares about the source, duration and trim range.
export default memo(ThumbnailStrip);
