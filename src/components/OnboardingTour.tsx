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
  rect: Rect | null,
  position: TourStep["position"],
  tooltipRef: React.RefObject<HTMLDivElement | null>,
): React.CSSProperties {
  const tooltip = tooltipRef.current;
  const tw = tooltip?.offsetWidth ?? 320;
  const th = tooltip?.offsetHeight ?? 140;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1000;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 1000;

  if (!rect) {
    // Elegant fallback: Center the tooltip in the viewport
    return {
      top: Math.max(12, (viewportHeight - th) / 2),
      left: Math.max(12, (viewportWidth - tw) / 2),
    };
  }

  const sr = {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };

  let left = 0;
  let top = 0;

  switch (position) {
    case "top":
      top = sr.top - th - TOOLTIP_OFFSET;
      left = sr.left + sr.width / 2 - tw / 2;
      break;
    case "left":
      top = sr.top + sr.height / 2 - th / 2;
      left = sr.left - tw - TOOLTIP_OFFSET;
      break;
    case "right":
      top = sr.top + sr.height / 2 - th / 2;
      left = sr.left + sr.width + TOOLTIP_OFFSET;
      break;
    case "bottom":
    default:
      top = sr.top + sr.height + TOOLTIP_OFFSET;
      left = sr.left + sr.width / 2 - tw / 2;
      break;
  }

  // Constrain tooltip to viewport boundaries with a safe margin
  const margin = 12;

  if (left < margin) {
    left = margin;
  } else if (left + tw > viewportWidth - margin) {
    left = Math.max(margin, viewportWidth - tw - margin);
  }

  if (top < margin) {
    top = margin;
  } else if (top + th > viewportHeight - margin) {
    top = Math.max(margin, viewportHeight - th - margin);
  }

  return { top, left };
}

interface SpotlightProps {
  rect: Rect | null;
}

function Spotlight({ rect }: SpotlightProps) {
  if (!rect) {
    return (
      <div
        className="fixed inset-0 bg-black/65 pointer-events-none"
        style={{ zIndex: 9998 }}
        aria-hidden="true"
      />
    );
  }

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
  rect: Rect | null;
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
      className="fixed z-[9999] w-80 max-w-[calc(100vw-24px)] rounded-xl shadow-2xl border
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

  const measureTarget = useCallback((id: string): Rect | null => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    };
  }, []);

  const scrollToTarget = useCallback((id: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const attempt = (tries: number) => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            resolve(true);
          }, 400); // wait for scroll to finish
          return;
        }
        if (tries <= 0) {
          resolve(false);
          return;
        }
        setTimeout(() => attempt(tries - 1), 200);
      };
      attempt(5);
    });
  }, []);

  // Initialise on mount
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(async () => {
      const firstTarget = TOUR_STEPS[0]?.targetId ?? "";
      await scrollToTarget(firstTarget);
      const rect = measureTarget(firstTarget);
      setTargetRect(rect);
      setVisible(true);
    }, 600);
    return () => clearTimeout(t);
  }, [measureTarget, scrollToTarget]);

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
    const maxRetries = 3;
    let retryTimer: number | null = null;
    let cancelled = false;

    // Reset rect to null while loading the new step's element
    setTargetRect(null);

    const tryScrollAndMeasure = () => {
      scrollToTarget(currentStep.targetId).then((scrolled) => {
        if (cancelled) return;
        const rect = measureTarget(currentStep.targetId);
        if (rect) {
          setTargetRect(rect);
          setTimeout(() => tooltipRef.current?.focus(), 50);
        } else if (retryCount < maxRetries) {
          retryCount++;
          retryTimer = window.setTimeout(tryScrollAndMeasure, 300);
        } else {
          // If element not found after retries, fallback to centered tooltip
          setTargetRect(null);
          setTimeout(() => tooltipRef.current?.focus(), 50);
        }
      }).catch((err) => {
        console.error("Failed to scroll to target:", err);
        setTargetRect(null);
      });
    };

    tryScrollAndMeasure();

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [stepIndex, visible, measureTarget, scrollToTarget, dismiss, currentStep]);

  // Re-measure on resize or scroll so spotlight stays anchored to target.
  useEffect(() => {
    if (!visible || !currentStep) return;
    let rafId: number;
    const remeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = measureTarget(currentStep.targetId);
        setTargetRect(rect);
      });
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [visible, currentStep, measureTarget]);

  // Lock scroll when tour is visible by preventing scroll wheel/touch/keys
  useEffect(() => {
    if (!visible) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
    };

    const preventScrollKeys = (e: KeyboardEvent) => {
      const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Space", "Home", "End"];
      if (keys.includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScrollKeys, { passive: false });

    return () => {
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScrollKeys);
    };
  }, [visible]);

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
