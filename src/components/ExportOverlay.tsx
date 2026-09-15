"use client";

import FocusTrap from "focus-trap-react";
import { useEffect, useRef, useCallback, useState } from "react";
import { ExportStatus } from "@/lib/types";
import LottiePlayer from "./LottiePlayer";
import { useLottieAnimation } from "@/hooks/useLottieAnimation";
import TipCarousel from "./TipCarousel";

interface Props {
  status: ExportStatus;
  progress: number;
  exportStartedAt?: number | null;
  onCancel?: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ExportOverlay({ status, progress, exportStartedAt, onCancel }: Props) {
  const visible = status === "loading-engine" || status === "exporting";
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusAnchorRef = useRef<HTMLDivElement | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const { animationData: spinnerAnim, isLoading: animLoading } = useLottieAnimation(
    "@/lib/lottie/spinner.json"
  );

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
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg)]/95 backdrop-blur-sm"
      >
        <div
          className="text-center space-y-6 max-w-xs px-6 animate-fade-in"
          aria-live="polite"
        >
          <div
            ref={focusAnchorRef}
            tabIndex={-1}
            className="sr-only"
            aria-hidden="true"
          />
          <div className="mx-auto w-20 h-20">
            {spinnerAnim ? (
              <LottiePlayer
                animationData={spinnerAnim}
                loop
                autoplay
                aria-hidden="true"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-film-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="export-text">
            <h2 className="font-heading font-bold text-xl tracking-tight text-[var(--text)]">
              {isLoading ? "Loading engine" : "Exporting"}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              {isLoading
                ? "Downloading the video engine. This only happens once."
                : "Processing your video locally."}
            </p>
            <p className="text-xs font-heading font-semibold text-film-600 mt-2 uppercase tracking-wide">
              Do not close or refresh this tab
            </p>
          </div>
          <span className="sr-only">
            {status === "loading-engine"
              ? `Loading video engine: ${progress}%`
              : `Exporting: ${progress}%, ${formatElapsed(elapsedMs)} elapsed`}
          </span>
            <div className="w-full space-y-2">
              <div className="h-1 w-full bg-film-100 rounded-full overflow-hidden">
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={isLoading ? "Engine download progress" : "Export progress"}
                  className="h-full bg-film-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-4 text-xs font-heading font-semibold text-[var(--muted)]">
                <span>{progress}%</span>
                {!isLoading && (
                  <span>{formatElapsed(elapsedMs)} elapsed</span>
                )}
              </div>
              <TipCarousel />
              {!isLoading && (
              <div className="flex flex-col items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => onCancel?.()}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] px-4 py-2 text-sm font-semibold text-[var(--error)] transition-colors hover:bg-[var(--error-hover)] active:scale-[0.98]"
                >
                  Cancel Export
                </button>
                <p className="text-[var(--text)] text-xs">
                  Press Escape to cancel
                </p>
              </div>
              )}
            </div>
        </div>
      </div>
    </FocusTrap>
  );
}
