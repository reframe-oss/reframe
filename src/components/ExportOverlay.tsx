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
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ExportOverlay({ status, progress, exportStartedAt, onCancel, summary }: Props) {
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-fade-in"
      >
        <div className="panel w-full max-w-sm p-6 shadow-[var(--shadow-overlay)]">
          <div ref={focusAnchorRef} tabIndex={-1} className="sr-only" aria-hidden="true" />

          <h2 id="export-overlay-title" className="text-lg font-semibold">
            {isLoading ? "Starting the video engine" : "Exporting"}
          </h2>
          <p id="export-overlay-desc" className="mt-1 text-sm text-[var(--muted)]">
            {isLoading
              ? "Downloading FFmpeg (about 30 MB) the first time. After that it loads from your browser cache."
              : "Your video is processed on this device. Keep this tab open until it finishes."}
          </p>

          {summary && (
            <dl className="mt-4 grid grid-cols-3 gap-3 rounded-control bg-[var(--surface-2)] p-3 text-xs">
              <div>
                <dt className="text-[var(--muted)]">Format</dt>
                <dd className="mt-0.5 font-medium">{summary.format}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Size</dt>
                <dd className="tabular mt-0.5 font-medium">{summary.resolution}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Quality</dt>
                <dd className="mt-0.5 font-medium">{summary.quality}</dd>
              </div>
            </dl>
          )}

          <div className="mt-5 space-y-2" aria-live="polite">
            {isLoading ? (
              // The engine download doesn't report byte progress, so this is
              // an honest indeterminate state rather than a fake percentage.
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)] animate-spin"
                />
                Loading engine…
              </div>
            ) : (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuenow={clamped}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Export progress"
                >
                  <div className="progress-fill" style={{ transform: `scaleX(${clamped / 100})` }} />
                </div>
                <div className="tabular flex items-center justify-between text-xs text-[var(--muted)]">
                  <span className="font-medium text-[var(--text)]">{clamped}%</span>
                  <span>{formatElapsed(elapsedMs)} elapsed</span>
                </div>
              </>
            )}
            <span className="sr-only">
              {isLoading
                ? "Loading video engine"
                : `Exporting: ${clamped}%, ${formatElapsed(elapsedMs)} elapsed`}
            </span>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
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
