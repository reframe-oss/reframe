"use client";

import FocusTrap from "focus-trap-react";
import { useEffect, useRef, useCallback, useState } from "react";
import { ExportStatus } from "@/lib/types";
import TipCarousel from "./TipCarousel";

export interface ExportSummary {
  /** e.g. "MP4" */
  format: string;
  /** e.g. "1080 × 1920" */
  resolution: string;
  /** e.g. "Balanced (CRF 23)" */
  quality: string;
}

interface Props {
  status: ExportStatus;
  progress: number;
  exportStartedAt?: number | null;
  onCancel?: () => void;
  summary?: ExportSummary;
  /** One line about a change mid-export, e.g. the engine fallback. */
  notice?: string | null;
}

/**
 * Time left, extrapolated from progress so far, or null while it would be a
 * guess: before 3% or 3 s, and once it's nearly done.
 */
export function estimateRemainingMs(progress: number, elapsedMs: number): number | null {
  if (progress < 3 || progress >= 99 || elapsedMs < 3000) return null;
  return (elapsedMs * (100 - progress)) / progress;
}

function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `about ${Math.max(5, Math.ceil(seconds / 5) * 5)} s left`;
  return `about ${Math.ceil(seconds / 60)} min left`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ExportOverlay({ status, progress, exportStartedAt, onCancel, summary, notice }: Props) {
  const visible = status === "loading-engine" || status === "exporting";
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusAnchorRef = useRef<HTMLDivElement | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel?.();
    }
  }, [onCancel]);

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("keydown", handleKeyDown);
    previousFocusRef.current = document.activeElement as HTMLElement;
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, handleKeyDown]);

  useEffect(() => {
    if (!visible && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (status !== "exporting" || !exportStartedAt) {
      // Part of the same timer-subscription lifecycle below, not a
      // derivable value — elapsedMs tracks wall-clock time via setInterval.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(Date.now() - exportStartedAt);
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [status, exportStartedAt]);

  if (!visible) return null;

  const isLoading = status === "loading-engine";
  const clamped = Math.max(0, Math.min(100, progress));
  const remainingMs = estimateRemainingMs(clamped, elapsedMs);
  const timeText = `${formatElapsed(elapsedMs)} elapsed${remainingMs === null ? "" : `, ${formatRemaining(remainingMs)}`}`;

  return (
    <FocusTrap
      active={visible}
      focusTrapOptions={{
        escapeDeactivates: true,
        clickOutsideDeactivates: false,
        initialFocus: () => focusAnchorRef.current!,
        fallbackFocus: () => focusAnchorRef.current!,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-overlay-title"
        aria-describedby="export-overlay-desc"
        tabIndex={-1}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      >
        <div className="panel enter max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-6 shadow-[var(--shadow-overlay)] sm:p-7">
          <div ref={focusAnchorRef} tabIndex={-1} className="sr-only" aria-hidden="true" />

          {/* Two real stages, so they're numbered: (1) engine, (2) encode. */}
          <p className="marker" aria-hidden="true">
            ({isLoading ? "1" : "2"} of 2)
          </p>
          <h2 id="export-overlay-title" className="serif mt-2 text-3xl leading-tight">
            {isLoading ? "Starting the video engine" : "Exporting"}
          </h2>
          <p id="export-overlay-desc" className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {isLoading
              ? "Downloading FFmpeg (about 30 MB) the first time. After that it loads from your browser cache."
              : "Your video is processed on this device. Keep this tab open until it finishes."}
          </p>
          {notice && (
            <p role="status" className="mt-3 text-sm leading-6 text-[var(--text)]">
              {notice}
            </p>
          )}

          <div className="mt-6">
            {isLoading ? (
              // The engine download doesn't report byte progress, so this is
              // an honest indeterminate state rather than a fake percentage.
              <>
                <div className="progress-track progress-indeterminate" aria-hidden="true" />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading engine…</p>
              </>
            ) : (
              <>
                {/* Large serif figure with a small italic unit, as in the reference. */}
                <p aria-hidden="true" className="flex items-baseline gap-1.5 text-[var(--text)]">
                  <span className="display text-6xl [font-variant-numeric:lining-nums_tabular-nums]">{clamped}</span>
                  <span className="marker text-3xl text-[var(--text-secondary)]">%</span>
                  <span className="tabular ml-auto text-right text-xs text-[var(--muted)]">{timeText}</span>
                </p>
                <div
                  className="progress-track mt-4"
                  role="progressbar"
                  aria-valuenow={clamped}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${clamped}%, ${timeText}`}
                  aria-label="Export progress"
                >
                  <div className="progress-fill" style={{ transform: `scaleX(${clamped / 100})` }} />
                </div>
              </>
            )}
            {/* Announces the stage only. Percentages are announced in 10% steps
                by the editor's live region, not on every update. */}
            <span className="sr-only" role="status">
              {isLoading ? "Loading video engine" : "Exporting video"}
            </span>
          </div>

          {summary && (
            <dl className="mt-6 grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)] py-3 text-xs">
              <div className="pr-3">
                <dt className="text-[var(--muted)]">Format</dt>
                <dd className="mt-0.5 font-medium">{summary.format}</dd>
              </div>
              <div className="px-3">
                <dt className="text-[var(--muted)]">Size</dt>
                <dd className="tabular mt-0.5 font-medium">{summary.resolution}</dd>
              </div>
              <div className="pl-3">
                <dt className="text-[var(--muted)]">Quality</dt>
                <dd className="mt-0.5 font-medium">{summary.quality}</dd>
              </div>
            </dl>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--muted)]">
              <kbd className="kbd">Esc</kbd> to cancel
            </span>
            <button type="button" onClick={() => onCancel?.()} className="btn btn-secondary">
              Cancel export
            </button>
          </div>

          {!isLoading && <TipCarousel />}
        </div>
      </div>
    </FocusTrap>
  );
}
