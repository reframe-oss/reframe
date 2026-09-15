"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

const TOUR_KEY = "reframe_onboarding_complete";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  requiresFile?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "upload-zone",
    title: "Drop your video here",
    description:
      "Click to browse or drag and drop a video file to get started.",
    position: "right",
  },
  {
    targetId: "preset-selector",
    title: "Pick an output format",
    description:
      "Choose a preset optimised for your platform — Instagram, YouTube, TikTok and more.",
    position: "left",
  },
  {
    targetId: "trim",
    title: "Trim & adjust",
    description:
      "After uploading, set in/out points and tweak colour in the controls that appear on the left.",
    position: "left",
  },
  {
    targetId: "export-button",
    title: "Export your video",
    description:
      "Click Export (or press ⌘↵) to process your video locally — nothing ever leaves your device.",
    position: "top",
  },
];

const PADDING = 12; // spotlight padding around target element
const TOOLTIP_OFFSET = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTooltipStyle(
  rect: Rect,
  position: TourStep["position"],
  tooltipRef: React.RefObject<HTMLDivElement | null>,
): React.CSSProperties {
  const tooltip = tooltipRef.current;
  const tw = tooltip?.offsetWidth ?? 320;
  const th = tooltip?.offsetHeight ?? 140;

  const VIEWPORT_MARGIN = 12; // minimum gap from viewport edge
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const sr = {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };

  // Compute position for a given side
  const calcPos = (side: TourStep["position"]): { top: number; left: number } => {
    switch (side) {
      case "top":
        return {
          top: sr.top - th - TOOLTIP_OFFSET,
          left: sr.left + sr.width / 2 - tw / 2,
        };
      case "left":
        return {
          top: sr.top + sr.height / 2 - th / 2,
          left: sr.left - tw - TOOLTIP_OFFSET,
        };
      case "right":
        return {
          top: sr.top + sr.height / 2 - th / 2,
          left: sr.left + sr.width + TOOLTIP_OFFSET,
        };
      case "bottom":
      default:
        return {
          top: sr.top + sr.height + TOOLTIP_OFFSET,
          left: sr.left + sr.width / 2 - tw / 2,
        };
    }
  };

  // Check if a position fits within the viewport
  const fits = (pos: { top: number; left: number }): boolean =>
    pos.top >= VIEWPORT_MARGIN &&
    pos.left >= VIEWPORT_MARGIN &&
    pos.top + th <= vh - VIEWPORT_MARGIN &&
    pos.left + tw <= vw - VIEWPORT_MARGIN;

  const opposite: Record<string, TourStep["position"]> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };

  // Try preferred side first, then opposite, then remaining sides
  let pos = calcPos(position);
  if (!fits(pos)) {
    const oppPos = calcPos(opposite[position ?? "bottom"]);
    if (fits(oppPos)) {
      pos = oppPos;
    } else {
      // Try all sides and pick the first that fits
      const sides: TourStep["position"][] = ["bottom", "right", "top", "left"];
      for (const side of sides) {
        const sidePos = calcPos(side);
        if (fits(sidePos)) {
          pos = sidePos;
          break;
        }
      }
    }
  }

  // Final clamp: ensure tooltip never exceeds viewport bounds
  pos.top = Math.max(VIEWPORT_MARGIN, Math.min(pos.top, vh - th - VIEWPORT_MARGIN));
  pos.left = Math.max(VIEWPORT_MARGIN, Math.min(pos.left, vw - tw - VIEWPORT_MARGIN));

  return { top: pos.top, left: pos.left };
}

interface SpotlightProps {
  rect: Rect;
}

function Spotlight({ rect }: SpotlightProps) {
  const r = {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };

  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 9998 }}
      aria-hidden="true"
    >
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={r.left}
            y={r.top}
            width={r.width}
            height={r.height}
            rx={8}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.65)"
        mask="url(#spotlight-mask)"
      />
      {/* Highlight ring */}
      <rect
        x={r.left}
        y={r.top}
        width={r.width}
        height={r.height}
        rx={8}
        fill="none"
        stroke="rgba(99,102,241,0.8)"
        strokeWidth={2}
      />
    </svg>
  );
}

interface TooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  rect: Rect;
  onNext: () => void;
  onSkip: () => void;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}

function Tooltip({
  step,
  stepIndex,
  totalSteps,
  rect,
  onNext,
  onSkip,
  tooltipRef,
}: TooltipProps) {
  const style = getTooltipStyle(rect, step.position, tooltipRef);
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      ref={tooltipRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding step ${stepIndex + 1} of ${totalSteps}: ${step.title}`}
      className="fixed z-[9999] w-80 rounded-xl shadow-2xl border
        bg-[var(--surface)]
        border-[var(--border)]
        text-[var(--text)]
        transition-all duration-200"
      style={{ ...style }}
      tabIndex={-1}
    >
      {/* Progress bar */}
      <div className="h-1 rounded-t-xl overflow-hidden bg-[var(--border)]">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      <div className="p-5">
        {/* Step counter */}
        <p className="text-xs font-semibold tracking-widest uppercase text-indigo-500 mb-1">
          Step {stepIndex + 1} of {totalSteps}
        </p>

        <h2 className="text-base font-semibold mb-1">{step.title}</h2>
        <p className="text-sm text-[var(--muted)] leading-relaxed mb-4">
          {step.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors underline underline-offset-2"
          >
            Skip tour
          </button>
          <button
            onClick={onNext}
            ref={(el) => {
              el?.focus();
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium
              bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
              text-white transition-colors focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {isLast ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const currentStep = TOUR_STEPS[stepIndex];

  const dismiss = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "1");
    setVisible(false);
  }, []);

  const measureTarget = useCallback((id: string): Promise<Rect | null> => {
    return new Promise((resolve) => {
      const attempt = (tries: number) => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            const r = el.getBoundingClientRect();
            resolve({
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
            });
          }, 400); // wait for scroll to finish
          return;
        }
        if (tries <= 0) {
          resolve(null);
          return;
        }
        setTimeout(() => attempt(tries - 1), 300);
      };
      attempt(5);
    });
  }, []);

  // Initialise on mount
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(async () => {
      const rect = await measureTarget(TOUR_STEPS[0]?.targetId ?? "");
      if (rect) {
        setTargetRect(rect);
        setVisible(true);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [measureTarget]);

  // Measure target whenever step changes (skip on first render — init effect handles that)
  useEffect(() => {
    if (!visible) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!currentStep) {
      dismiss();
      return;
    }

    let retryCount = 0;
    const maxRetries = 10; // Retry up to ~5s with 500ms delays
    let retryTimer: number | null = null;
    let cancelled = false;

    const tryMeasure = () => {
      measureTarget(currentStep.targetId)
        .then((rect) => {
          if (cancelled) return;
          if (rect) {
            setTargetRect(rect);
            setTimeout(() => tooltipRef.current?.focus(), 50);
            retryCount = 0;
          } else if (retryCount < maxRetries) {
            retryCount++;
            retryTimer = window.setTimeout(tryMeasure, 500);
          } else {
            // If we've retried enough, fallback to advancing or dismissing
            if (stepIndex < TOUR_STEPS.length - 1) setStepIndex((i) => i + 1);
            else dismiss();
          }
        })
        .catch((error) => {
          console.error("Failed to measure tour target:", error);
          dismiss();
        });
    };

    tryMeasure();

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [stepIndex, visible, measureTarget, dismiss, currentStep]);

  // Re-measure on resize or scroll so spotlight stays anchored to target.
  // requestAnimationFrame prevents layout thrashing on rapid scroll/resize events.
  useEffect(() => {
    if (!visible) return;
    let rafId: number;
    const remeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        measureTarget(TOUR_STEPS[stepIndex]?.targetId ?? "").then(setTargetRect);
      });
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [visible, stepIndex, measureTarget]);

  // Keyboard support
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (stepIndex < TOUR_STEPS.length - 1) setStepIndex((i) => i + 1);
        else dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, stepIndex, dismiss]);

  // Lock body scroll when tour is active
  useEffect(() => {
    if (!visible) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [visible]);

  if (!visible || !targetRect || !currentStep) return null;

  return createPortal(
    <>
      {/* Clickable backdrop to skip */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9997 }}
        aria-hidden="true"
        onClick={dismiss}
      />
      <Spotlight rect={targetRect} />
      <Tooltip
        step={currentStep}
        stepIndex={stepIndex}
        totalSteps={TOUR_STEPS.length}
        rect={targetRect}
        onNext={() => {
          if (stepIndex < TOUR_STEPS.length - 1) setStepIndex((i) => i + 1);
          else dismiss();
        }}
        onSkip={dismiss}
        tooltipRef={tooltipRef}
      />
    </>,
    document.body,
  );
}
