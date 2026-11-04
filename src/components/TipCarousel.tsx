"use client";

import { useEffect, useState, useRef } from "react";
import { ShieldCheck, Zap, Keyboard, Cpu, SlidersHorizontal } from "lucide-react";

interface Tip {
  category: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const TIPS: Tip[] = [
  {
    category: "Privacy",
    title: "Everything stays on this device",
    description: "Your video files never leave your device. All processing happens entirely within your browser's secure client-side sandbox.",
    icon: ShieldCheck,
  },
  {
    category: "Performance",
    title: "Keep this tab in front",
    description: "Keep this browser tab active and focused. The browser heavily throttles background WebAssembly threads to save power.",
    icon: Zap,
  },
  {
    category: "Workflow",
    title: "Keyboard shortcuts",
    description: "Press Space to play/pause the preview, M to mute, and Ctrl/Cmd+Enter to trigger an export instantly.",
    icon: Keyboard,
  },
  {
    category: "How it works",
    title: "FFmpeg WebAssembly",
    description: "Reframe compiles powerful C/C++ libraries into WASM, allowing complex video pipelines to run locally in the browser.",
    icon: Cpu,
  },
  {
    category: "Tip",
    title: "Quality vs. file size",
    description: "Adjusting the Constant Rate Factor (CRF) slider gives you total control over the sweet spot between visual quality and file size.",
    icon: SlidersHorizontal,
  },
];

export default function TipCarousel() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rotateTip = () => {
    setIsFading(true);
    timeoutRef.current = setTimeout(() => {
      setActiveIdx((prev) => (prev + 1) % TIPS.length);
      setIsFading(false);
    }, 160);
  };

  useEffect(() => {
    // Auto-advancing content is motion the user didn't ask for; under
    // reduced motion the tips change only when a dot is chosen.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    intervalRef.current = setInterval(rotateTip, 6000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleDotClick = (idx: number) => {
    if (idx === activeIdx || isFading) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setIsFading(true);
    timeoutRef.current = setTimeout(() => {
      setActiveIdx(idx);
      setIsFading(false);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        intervalRef.current = setInterval(rotateTip, 6000);
      }
    }, 160);
  };

  const activeTip = TIPS[activeIdx];
  if (!activeTip) return null;
  const IconComponent = activeTip.icon; 

  return (
    <div data-tip-carousel="" className="mt-5 border-t border-[var(--border)] pt-4 text-left">
      <div
        className={`min-h-[92px] transition-opacity duration-base ${isFading ? "opacity-0" : "opacity-100"}`}
        aria-live="off"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--selected)]">
          <IconComponent size={13} aria-hidden="true" />
          {activeTip.category}
        </div>
        <h3 className="serif mt-1.5 text-lg leading-snug text-[var(--text)]">{activeTip.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{activeTip.description}</p>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1">
        {TIPS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleDotClick(idx)}
            aria-label={`Show tip ${idx + 1} of ${TIPS.length}`}
            aria-current={idx === activeIdx ? "true" : undefined}
            className="flex h-6 w-6 items-center justify-center rounded-full"
          >
            <span
              aria-hidden="true"
              // Active tip: a short bar rather than a red dot (red is reserved).
              className={`block h-[3px] rounded-full transition-[width,background-color] duration-base ${
                idx === activeIdx ? "w-4 bg-[var(--text)]" : "w-1.5 bg-[var(--border-strong)]"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
