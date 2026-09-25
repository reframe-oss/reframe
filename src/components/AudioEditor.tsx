"use client";

import { useHighResWaveform } from "@/hooks/useHighResWaveform";
import { cn, formatDuration } from "@/lib/utils";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 5, 10] as const;
const BASE_PPS = 80;
const HANDLE_HIT_WIDTH = 20;
const MIN_CLIP_DURATION = 0.1;
const DEFAULT_BAR_COUNT = 2048;

function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function generateFFmpegArgs(
  trimStart: number,
  trimEnd: number | null,
  duration: number
): string[] {
  const end = trimEnd ?? duration;
  if (end <= trimStart) return ["-ss", "0"];
  return ["-ss", `${trimStart}`, "-to", `${end}`, "-c", "copy"];
}

interface AudioEditorProps {
  src: File | string | null;
  currentTime?: number;
  duration?: number;
  trimStart?: number;
  trimEnd?: number | null;
  onTrimChange?: (start: number, end: number | null) => void;
  onDurationChange?: (duration: number) => void;
  className?: string;
}

export default function AudioEditor({
  src,
  currentTime = 0,
  duration: externalDuration,
  trimStart = 0,
  trimEnd,
  onTrimChange,
  onDurationChange,
  className,
}: AudioEditorProps) {
  const { waveform, isLoading, error, duration: extractedDuration } = useHighResWaveform(src, {
    barCount: DEFAULT_BAR_COUNT,
  });

  const duration = externalDuration ?? extractedDuration;
  const effectiveTrimEnd = trimEnd ?? duration;
  const hasValidData = waveform.length > 0 && duration > 0;

  useEffect(() => {
    if (extractedDuration > 0 && !externalDuration) {
      onDurationChange?.(extractedDuration);
    }
  }, [extractedDuration, externalDuration, onDurationChange]);

  const [zoomIndex, setZoomIndex] = useState(2);
  const [scrollLeft, setScrollLeft] = useState(0);

  const pixelsPerSecond = ZOOM_LEVELS[zoomIndex] * BASE_PPS;
  const totalWidth = hasValidData ? duration * pixelsPerSecond : 800;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(currentTime);
  const dragRef = useRef<{ type: "start" | "end" } | null>(null);
  const prevDrawRef = useRef("");

  currentTimeRef.current = currentTime;

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    if (scrollLeft !== el.scrollLeft) {
      el.scrollLeft = scrollLeft;
    }
  }, [totalWidth]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (duration > 0 && ZOOM_LEVELS[zoomIndex] <= 1) {
      scrollRef.current.scrollLeft = 0;
      setScrollLeft(0);
    }
  }, [zoomIndex, duration]);

  const zoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomIndex(2);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      setScrollLeft(0);
    }
  }, []);

  const getTimeFromPointer = useCallback(
    (clientX: number) => {
      const scrollContainer = scrollRef.current;
      if (!scrollContainer || !hasValidData) return 0;
      const rect = scrollContainer.getBoundingClientRect();
      const x = clientX - rect.left + scrollContainer.scrollLeft;
      return Math.max(0, Math.min(duration, x / pixelsPerSecond));
    },
    [duration, pixelsPerSecond, hasValidData]
  );

  const handlePointerDown = useCallback(
    (type: "start" | "end") => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { type };
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const time = getTimeFromPointer(e.clientX);
      if (dragRef.current.type === "start") {
        const clamped = Math.min(time, effectiveTrimEnd - MIN_CLIP_DURATION);
        onTrimChange?.(Math.max(0, clamped), trimEnd ?? null);
      } else {
        const clamped = Math.max(time, trimStart + MIN_CLIP_DURATION);
        onTrimChange?.(trimStart, hasValidData ? Math.min(duration, clamped) : null);
      }
    },
    [getTimeFromPointer, effectiveTrimEnd, trimStart, trimEnd, duration, hasValidData, onTrimChange]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragRef.current) return;
      if (e.target !== canvasRef.current) return;
      const time = getTimeFromPointer(e.clientX);
      onTrimChange?.(Math.max(0, Math.min(time, (trimEnd ?? duration) - MIN_CLIP_DURATION)), trimEnd ?? null);
    },
    [getTimeFromPointer, trimEnd, duration, onTrimChange]
  );

  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const updateWidth = () => {
      setContainerWidth(scrollContainer.getBoundingClientRect().width);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollContainer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasValidData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (Math.abs(canvas.width - w * dpr) > 0.5 || Math.abs(canvas.height - h * dpr) > 0.5) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    const visibleStart = scrollLeft / pixelsPerSecond;
    const visibleEnd = (scrollLeft + w) / pixelsPerSecond;
    const barsPerSecond = waveform.length / duration;
    const barStart = Math.max(0, Math.floor(visibleStart * barsPerSecond));
    const barEnd = Math.min(waveform.length, Math.ceil(visibleEnd * barsPerSecond));

    const drawKey = `${waveform.length}-${zoomIndex}-${Math.round(scrollLeft)}-${trimStart}-${effectiveTrimEnd}-${w}-${h}`;
    if (prevDrawRef.current === drawKey && waveform.length > 0) return;
    prevDrawRef.current = drawKey;

    ctx.clearRect(0, 0, w, h);
    const midY = h / 2;
    const accentColor = getCssVar("--accent", "#4f6ef7");

    if (barEnd <= barStart || waveform.length === 0) {
      ctx.beginPath();
      ctx.strokeStyle = accentColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = accentColor;
      for (let i = barStart; i < barEnd; i++) {
        const barTime = i / barsPerSecond;
        const x = (barTime - visibleStart) * pixelsPerSecond;
        const barWidth = Math.max(0.5, pixelsPerSecond / barsPerSecond - 0.3);
        const peak = waveform[i];
        const top = midY - (peak?.max ?? 0) * midY * 0.92;
        const bottom = midY - (peak?.min ?? 0) * midY * 0.92;
        ctx.fillRect(x, top, barWidth, Math.max(bottom - top, 0.5));
      }
    }
  }, [waveform, duration, pixelsPerSecond, scrollLeft, trimStart, effectiveTrimEnd, zoomIndex, hasValidData]);

  useEffect(() => {
    const el = cursorRef.current;
    if (!el) return;
    let rafId: number;
    const tick = () => {
      const time = currentTimeRef.current;
      const x = time * pixelsPerSecond - scrollLeft;
      el.style.transform = `translateX(${x}px)`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pixelsPerSecond, scrollLeft]);

  const visibleStartTime = scrollLeft / pixelsPerSecond;
  const startHandleX = (trimStart - visibleStartTime) * pixelsPerSecond;
  const endHandleX = (effectiveTrimEnd - visibleStartTime) * pixelsPerSecond;

  const clipDuration = effectiveTrimEnd - trimStart;

  const ffmpegArgs = useMemo(
    () => generateFFmpegArgs(trimStart, trimEnd, duration),
    [trimStart, trimEnd, duration]
  );

  const showCursor = hasValidData && currentTime >= visibleStartTime && currentTime <= visibleStartTime + (containerWidth / pixelsPerSecond);

  if (isLoading) {
    return (
      <div className={cn("space-y-3 animate-fade-in", className)}>
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded-md bg-[var(--surface)] border border-[var(--border)] animate-pulse" />
        </div>
        <div className="h-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden relative">
          <div className="absolute inset-0 flex items-center gap-px px-2">
            {Array.from({ length: 64 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-[var(--accent)] opacity-20 animate-pulse"
                style={{
                  height: `${20 + Math.sin(i * 0.5) * 15 + Math.cos(i * 1.2) * 10}%`,
                  animationDelay: `${(i * 20) % 500}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 rounded-lg border border-[var(--error)] bg-[var(--error-bg)] text-sm text-[var(--error)]", className)}>
        {error}
      </div>
    );
  }

  if (!src) {
    return null;
  }

  return (
    <div className={cn("space-y-3 select-none", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)] mr-1">
            Zoom
          </span>
          {ZOOM_LEVELS.map((level, i) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoomIndex(i)}
              className={cn(
                "px-2 py-0.5 text-[11px] font-heading rounded transition-colors",
                zoomIndex === i
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)] bg-[var(--surface)] border border-[var(--border)]"
              )}
            >
              {level}x
            </button>
          ))}
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          {zoomIndex !== 2 && (
            <button
              type="button"
              onClick={resetZoom}
              className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
              aria-label="Reset zoom"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        <span className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
          Clip: {formatDuration(clipDuration)}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="relative overflow-x-auto overflow-y-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        style={{ height: "112px" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div style={{ width: `${totalWidth}px`, height: "1px", pointerEvents: "none" }} />

        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full"
          onClick={handleTrackClick}
          style={{ pointerEvents: "auto" }}
        />

        <div
          ref={cursorRef}
          className="absolute top-0 w-0.5 pointer-events-none z-10"
          style={{
            height: "100%",
            willChange: "transform",
            backgroundColor: "#ef4444",
            opacity: showCursor ? 0.85 : 0,
            boxShadow: "0 0 4px rgba(239,68,68,0.5)",
          }}
        />

        <div
          className="absolute top-0 z-20"
          style={{
            left: `${startHandleX}px`,
            width: `${HANDLE_HIT_WIDTH}px`,
            marginLeft: `${-HANDLE_HIT_WIDTH / 2}px`,
            height: "100%",
            pointerEvents: "auto",
            cursor: "ew-resize",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown("start")}
        >
          <div
            className="mx-auto w-full h-3 rounded-t-sm"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <div
            className="mx-auto w-0.5"
            style={{
              height: "calc(100% - 12px)",
              backgroundColor: "var(--accent)",
              opacity: 0.85,
            }}
          />
        </div>

        <div
          className="absolute top-0 z-20"
          style={{
            left: `${endHandleX}px`,
            width: `${HANDLE_HIT_WIDTH}px`,
            marginLeft: `${-HANDLE_HIT_WIDTH / 2}px`,
            height: "100%",
            pointerEvents: "auto",
            cursor: "ew-resize",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown("end")}
        >
          <div
            className="mx-auto w-full h-3 rounded-t-sm"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <div
            className="mx-auto w-0.5"
            style={{
              height: "calc(100% - 12px)",
              backgroundColor: "var(--accent)",
              opacity: 0.85,
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-heading font-semibold tracking-wider">
        <div className="flex items-center gap-2">
          <span className="text-[var(--muted)]">S:</span>
          <span className="text-[var(--text)]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDuration(trimStart)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {hasValidData && (
            <span className="text-[var(--muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              ▸ {formatDuration(currentTime)}
            </span>
          )}
          <button
            type="button"
            onClick={() => onTrimChange?.(0, trimEnd ?? null)}
            className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase"
            title="Reset trim start"
          >
            S
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--muted)]">E:</span>
          <span className="text-[var(--text)]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDuration(effectiveTrimEnd)}
          </span>
          <button
            type="button"
            onClick={() => onTrimChange?.(trimStart, hasValidData ? duration : null)}
            className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase"
            title="Reset trim end"
          >
            E
          </button>
        </div>
      </div>

      {hasValidData && (
        <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)] shrink-0">
              ffmpeg
            </span>
            <code className="truncate text-[11px] font-mono text-[var(--text)]">
              {ffmpegArgs
                .map((a) => (a.startsWith("-") ? a : `"${a}"`))
                .join(" ")}
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                ffmpegArgs.map((a) => (a.startsWith("-") ? a : `"${a}"`)).join(" ")
              );
            }}
            className="shrink-0 px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wider rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Copy FFmpeg arguments"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
