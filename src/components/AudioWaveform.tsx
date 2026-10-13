"use client";

import { useEffect, useRef, useCallback, useState, memo } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  samples: number[];
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number | null;
  loading: boolean;
  hasAudio: boolean;
  onTrimStartChange: (sec: number) => void;
  onTrimEndChange: (sec: number) => void;
  onSeek: (sec: number) => void;
}

const BAR_HEIGHT_RATIO = 0.85;
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const HANDLE_WIDTH = 12;

function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const Playhead = memo(function Playhead({ position }: { position: number }) {
  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
      style={{
        left: `${position * 100}%`,
        backgroundColor: "var(--accent)",
        boxShadow: "0 0 4px var(--accent)",
      }}
    >
      <div
        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: "var(--accent)" }}
      />
    </div>
  );
});

export default function AudioWaveform({
  samples,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  loading,
  hasAudio,
  onTrimStartChange,
  onTrimEndChange,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragging = useRef<"start" | "end" | "playhead" | null>(null);
  const rafRef = useRef<number | null>(null);
  const hoverTimeRef = useRef<number | null>(null);

  const effectiveDuration = duration > 0 ? duration : 1;
  const trimEndValue = trimEnd ?? effectiveDuration;

  const visibleDuration = effectiveDuration / zoom;
  const clampedScrollLeft = Math.max(0, Math.min(scrollLeft, effectiveDuration - visibleDuration));
  const scrollPct = clampedScrollLeft / effectiveDuration;
  const visiblePct = visibleDuration / effectiveDuration;

  const xToSeconds = useCallback(
    (clientX: number) => {
      const el = waveformRef.current;
      if (!el) return 0;
      const { left, width } = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
      return clampedScrollLeft + ratio * visibleDuration;
    },
    [clampedScrollLeft, visibleDuration]
  );

  const applyDrag = useCallback(
    (clientX: number) => {
      const sec = xToSeconds(clientX);
      if (dragging.current === "start") {
        const clamped = Math.min(sec, trimEndValue - 0.1);
        onTrimStartChange(Math.max(0, clamped));
      } else if (dragging.current === "end") {
        const clamped = Math.max(sec, trimStart + 0.1);
        onTrimEndChange(Math.min(effectiveDuration, clamped));
      } else if (dragging.current === "playhead") {
        onSeek(Math.max(0, Math.min(sec, effectiveDuration)));
      }
    },
    [xToSeconds, trimEndValue, trimStart, effectiveDuration, onTrimStartChange, onTrimEndChange, onSeek]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      let clientX: number;
      if ("touches" in e) {
        const touch = e.touches[0];
        if (!touch) return;
        clientX = touch.clientX;
      } else {
        clientX = e.clientX;
      }
      applyDrag(clientX);
    };

    const onUp = () => {
      dragging.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [applyDrag]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const midY = h / 2;
    const accentColor = getCssVar("--accent", "#4f6ef7");
    const bgColor = getCssVar("--surface", "#111");
    const mutedColor = getCssVar("--muted", "#888");

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (!hasAudio || samples.length === 0 || loading) {
      ctx.beginPath();
      ctx.strokeStyle = mutedColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    const startSample = Math.max(0, Math.floor((clampedScrollLeft / effectiveDuration) * samples.length));
    const visibleSamples = Math.max(1, Math.ceil((visibleDuration / effectiveDuration) * samples.length));
    const visibleSamplesArr = samples.slice(startSample, startSample + visibleSamples);

    const barWidth = w / visibleSamplesArr.length;

    const inTrimColor = accentColor;
    const outTrimColor = "rgba(255,255,255,0.15)";

    for (let i = 0; i < visibleSamplesArr.length; i++) {
      const amplitude = visibleSamplesArr[i] ?? 0;
      const barHeight = Math.max(amplitude * (h * BAR_HEIGHT_RATIO * 2), 1);
      const x = i * barWidth;

      const secAtBar = clampedScrollLeft + (i / visibleSamplesArr.length) * visibleDuration;
      const isInTrim = secAtBar >= trimStart && secAtBar <= trimEndValue;

      ctx.fillStyle = isInTrim ? inTrimColor : outTrimColor;
      ctx.globalAlpha = isInTrim ? 0.7 : 0.4;

      if (barWidth < 3) {
        ctx.fillRect(x, midY - barHeight / 2, 1, barHeight);
      } else {
        ctx.fillRect(x, midY - barHeight / 2, Math.max(barWidth - 0.5, 0.5), barHeight);
      }
    }

    ctx.globalAlpha = 1;

    // Trim region highlight background
    const trimStartX = ((trimStart - clampedScrollLeft) / visibleDuration) * w;
    const trimEndX = ((trimEndValue - clampedScrollLeft) / visibleDuration) * w;

    if (trimStartX > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, trimStartX, h);
    }

    if (trimEndX < w) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(trimEndX, 0, w - trimEndX, h);
    }

    // Trim border lines
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    if (trimStartX >= 0 && trimStartX <= w) {
      ctx.beginPath();
      ctx.moveTo(trimStartX, 0);
      ctx.lineTo(trimStartX, h);
      ctx.stroke();
    }

    if (trimEndX >= 0 && trimEndX <= w) {
      ctx.beginPath();
      ctx.moveTo(trimEndX, 0);
      ctx.lineTo(trimEndX, h);
      ctx.stroke();
    }

    // Time ruler ticks
    const tickInterval = getTickInterval(visibleDuration);
    const startTick = Math.ceil(clampedScrollLeft / tickInterval) * tickInterval;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = mutedColor;

    for (let t = startTick; t <= clampedScrollLeft + visibleDuration; t += tickInterval) {
      const xPos = ((t - clampedScrollLeft) / visibleDuration) * w;
      if (xPos < 0 || xPos > w) continue;
      ctx.fillRect(xPos, h - 6, 0.5, 6);
      ctx.fillText(formatTime(t), xPos, h - 8);
    }

    // Playhead
    const playheadX = ((currentTime - clampedScrollLeft) / visibleDuration) * w;
    if (playheadX >= 0 && playheadX <= w) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(playheadX, 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }

    // Hover time indicator
    if (hoverTimeRef.current !== null) {
      const hoverX = ((hoverTimeRef.current - clampedScrollLeft) / visibleDuration) * w;
      if (hoverX >= 0 && hoverX <= w) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(formatTime(hoverTimeRef.current), hoverX, 10);
      }
    }
  }, [samples, effectiveDuration, clampedScrollLeft, visibleDuration, trimStart, trimEndValue, currentTime, hasAudio, loading]);

  // Playhead RAF loop
  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [draw]);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * 1.5));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / 1.5));

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY > 0) {
          setZoom((z) => Math.max(MIN_ZOOM, z / 1.3));
        } else {
          setZoom((z) => Math.min(MAX_ZOOM, z * 1.3));
        }
      } else {
        const maxScroll = Math.max(0, effectiveDuration - visibleDuration);
        setScrollLeft((s) =>
          Math.max(0, Math.min(s + (e.deltaX > 0 ? visibleDuration * 0.1 : -visibleDuration * 0.1), maxScroll))
        );
      }
    },
    [effectiveDuration, visibleDuration]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging.current) return;
      const sec = xToSeconds(e.clientX);
      onSeek(Math.max(0, Math.min(sec, effectiveDuration)));
    },
    [xToSeconds, effectiveDuration, onSeek]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = waveformRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      const sec = clampedScrollLeft + ratio * visibleDuration;
      hoverTimeRef.current = Math.max(0, Math.min(sec, effectiveDuration));
    },
    [clampedScrollLeft, visibleDuration, effectiveDuration]
  );

  const handleMouseLeave = useCallback(() => {
    hoverTimeRef.current = null;
  }, []);

  if (loading) {
    return (
      <div className="w-full h-24 rounded-md overflow-hidden bg-[var(--surface)] relative border border-[var(--border)]">
        <div className="absolute inset-0 flex items-center gap-px px-2">
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-film-500 opacity-20 animate-pulse"
              style={{
                height: `${18 + Math.sin(i * 0.6) * 14 + Math.cos(i * 1.1) * 10}%`,
                animationDelay: `${(i * 25) % 500}ms`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const startPct = trimStart / effectiveDuration;
  const endPct = trimEndValue / effectiveDuration;

  return (
    <div className="space-y-2">
      {/* Zoom controls + time info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-30 transition-opacity"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] font-mono text-[var(--muted)] min-w-[3rem] text-center">
            {zoom.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-30 transition-opacity"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--muted)]">
          <span>{formatTime(trimStart)}</span>
          <span className="text-[var(--text)]">—</span>
          <span>{formatTime(trimEndValue)}</span>
        </div>
      </div>

      {/* Waveform + trim handles */}
      <div
        ref={waveformRef}
        className="relative border border-[var(--border)] rounded-md overflow-hidden select-none"
        style={{ height: "6rem" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        />

        {/* Trim start handle */}
        <div
          role="slider"
          aria-label="Trim start"
          aria-valuenow={trimStart}
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
          tabIndex={0}
          className="absolute top-0 bottom-0 z-10 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `calc(${startPct * 100}% - ${HANDLE_WIDTH / 2}px)` }}
          onMouseDown={() => { dragging.current = "start"; }}
          onTouchStart={() => { dragging.current = "start"; }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onTrimStartChange(Math.max(0, trimStart - 0.1));
            if (e.key === "ArrowRight") onTrimStartChange(Math.min(trimEndValue - 0.1, trimStart + 0.1));
          }}
        >
          <div
            className="w-3 h-full rounded-sm"
            style={{
              backgroundColor: "var(--accent)",
              opacity: 0.9,
              boxShadow: "0 0 4px rgba(0,0,0,0.5)",
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                <path d="M4 2L2 5L4 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Trim end handle */}
        <div
          role="slider"
          aria-label="Trim end"
          aria-valuenow={trimEndValue}
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
          tabIndex={0}
          className="absolute top-0 bottom-0 z-10 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `calc(${endPct * 100}% - ${HANDLE_WIDTH / 2}px)` }}
          onMouseDown={() => { dragging.current = "end"; }}
          onTouchStart={() => { dragging.current = "end"; }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onTrimEndChange(Math.max(trimStart + 0.1, trimEndValue - 0.1));
            if (e.key === "ArrowRight") onTrimEndChange(Math.min(effectiveDuration, trimEndValue + 0.1));
          }}
        >
          <div
            className="w-3 h-full rounded-sm"
            style={{
              backgroundColor: "var(--accent)",
              opacity: 0.9,
              boxShadow: "0 0 4px rgba(0,0,0,0.5)",
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                <path d="M2 2L4 5L2 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Scrollbar */}
        {zoom > MIN_ZOOM && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[var(--border)] z-20">
            <div
              className="h-full rounded-full"
              style={{
                width: `${visiblePct * 100}%`,
                marginLeft: `${scrollPct * 100}%`,
                backgroundColor: "var(--accent)",
                opacity: 0.6,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
        <span>{formatTime(clampedScrollLeft)}</span>
        <span className="text-[var(--text)]">{formatTime(currentTime)} / {formatTime(effectiveDuration)}</span>
        <span>{formatTime(Math.min(clampedScrollLeft + visibleDuration, effectiveDuration))}</span>
      </div>
    </div>
  );
}

function getTickInterval(visibleDuration: number): number {
  if (visibleDuration <= 5) return 1;
  if (visibleDuration <= 15) return 2;
  if (visibleDuration <= 30) return 5;
  if (visibleDuration <= 60) return 10;
  if (visibleDuration <= 300) return 30;
  return 60;
}
