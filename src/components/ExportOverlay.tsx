"use client";

import FocusTrap from "focus-trap-react";
import { useEffect, useRef, useCallback, useState } from "react";
import { ExportStatus } from "@/lib/types";
import LottiePlayer from "./LottiePlayer";
import spinnerAnim from "@/lib/lottie/spinner.json";
import TipCarousel from "./TipCarousel";

const exportSteps = [
  { label: "Loading", status: "loading-engine" as const },
  { label: "Exporting", status: "exporting" as const },
  { label: "Done", status: "done" as const },
];

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
  const [displayStatus, setDisplayStatus] = useState<ExportStatus>(status);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusAnchorRef = useRef<HTMLDivElement | null>(null);
  const visible = displayStatus === "loading-engine" || displayStatus === "exporting" || displayStatus === "done";
  const activeStepIndex = exportSteps.findIndex((step) => step.status === displayStatus);
  const [elapsedMs, setElapsedMs] = useState(0);
  const isLoading = displayStatus === "loading-engine";

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
    if (status === "done") {
      setDisplayStatus("done");
      const timer = window.setTimeout(() => {
        setDisplayStatus("idle");
      }, 1200);
      return () => window.clearTimeout(timer);
    }

    setDisplayStatus(status);
  }, [status]);

  useEffect(() => {
    if (!visible && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (displayStatus !== "exporting" || !exportStartedAt) {
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(Date.now() - exportStartedAt);
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [displayStatus, exportStartedAt]);

  if (!visible) return null;

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
            <LottiePlayer
              animationData={spinnerAnim}
              loop
              autoplay
              aria-hidden="true"
            />
          </div>
          <div className="export-text">
            <div className="flex items-center justify-center gap-2 text-[10px] font-heading font-semibold uppercase tracking-[0.28em] text-[var(--muted)] mb-4">
              {exportSteps.map((step, index) => {
                const isActive = index === activeStepIndex;
                const isComplete = displayStatus === "done" || index < activeStepIndex;

                return (
                  <div
                    key={step.status}
                    className={[
                      "flex items-center gap-2 transform transition-all duration-300",
                      isActive ? "text-[var(--text)] scale-105" : "text-[var(--muted)] scale-100",
                    ].join(" ")}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={[
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 transition-all duration-300",
                        isComplete
                          ? "border-film-600 bg-film-600 text-white"
                          : isActive
                          ? "border-[var(--text)] bg-[var(--surface)] text-[var(--text)] ring-2 ring-film-600 ring-offset-2 ring-offset-[var(--bg)] animate-pulse scale-110 shadow-lg"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {isComplete ? "✓" : index + 1}
                    </span>
                    <span className={isActive ? "font-semibold  animate-pulse scale-97" : undefined}>{step.label}</span>
                    {index < exportSteps.length - 1 && <span className="text-[var(--border)]">/</span>}
                  </div>
                );
              })}
            </div>
            <h2 className="font-heading font-bold text-xl tracking-tight text-[var(--text)]">
              {displayStatus === "loading-engine" ? "Loading engine" : displayStatus === "done" ? "Done" : "Exporting"}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              {displayStatus === "loading-engine"
                ? "Downloading the video engine. This only happens once."
                : displayStatus === "done"
                ? "Export complete. Your video is ready to download."
                : "Processing your video locally."}
            </p>
            <p className="text-xs font-heading font-semibold text-film-600 mt-2 uppercase tracking-wide">
              Do not close or refresh this tab
            </p>
          </div>
          <span className="sr-only">
            {displayStatus === "loading-engine"
              ? `Loading video engine: ${progress}%`
              : displayStatus === "done"
              ? "Export complete"
              : `Exporting: ${progress}%, ${formatElapsed(elapsedMs)} elapsed`}
          </span>
            <div className="w-full space-y-2">
              <div className="h-1 w-full bg-film-100 rounded-full overflow-hidden">
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={isLoading ? "Engine download progress" : displayStatus === "done" ? "Export complete" : "Export progress"}
                  className="h-full bg-film-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-4 text-xs font-heading font-semibold text-[var(--muted)]">
                <span>{progress}%</span>
                {!isLoading && (
                  <span>{displayStatus === "done" ? "Complete" : `${formatElapsed(elapsedMs)} elapsed`}</span>
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
                <p className="text-xs text-gray-500">Press Escape to cancel</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
