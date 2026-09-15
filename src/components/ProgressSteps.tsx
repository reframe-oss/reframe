"use client";

import { Upload, SlidersHorizontal, Zap, Download, Check } from "lucide-react";
import type { ExportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProgressStepsProps {
  file: File | null;
  status: ExportStatus;
}

const STEPS = [
  { label: "Upload", icon: Upload },
  { label: "Configure", icon: SlidersHorizontal },
  { label: "Export", icon: Zap },
  { label: "Download", icon: Download },
] as const;

type StepState = "completed" | "active" | "upcoming";

export default function ProgressSteps({ file, status }: ProgressStepsProps) {
  const currentStep = !file
    ? 0
    : status === "loading-engine" || status === "exporting"
      ? 2
      : status === "done"
        ? 3
        : 1;

  return (
    <nav aria-label="Workflow progress" className="w-full">
      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const state: StepState =
            i < currentStep ? "completed" : i === currentStep ? "active" : "upcoming";
          const Icon = step.icon;
          const isLast = i === STEPS.length - 1;

          return (
            <li
              key={step.label}
              className="flex items-start flex-1 last:flex-none"
              aria-current={state === "active" ? "step" : undefined}
            >
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <span
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none",
                    state === "completed" && "bg-[var(--accent)] border-[var(--accent)] text-white",
                    state === "active" && "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)]",
                    state === "upcoming" && "border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]"
                  )}
                >
                  {state === "completed" ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Icon size={16} aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-heading font-semibold uppercase tracking-widest whitespace-nowrap",
                    state === "upcoming" ? "text-[var(--muted)]" : "text-[var(--text)]"
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {state === "completed" ? "completed" : state === "active" ? "current step" : "upcoming"}
                </span>
              </div>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex-1 h-0.5 rounded-full mt-[18px] transition-colors duration-200 motion-reduce:transition-none",
                    i < currentStep ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
