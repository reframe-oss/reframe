"use client";

import { EditRecipe } from "@/lib/types";
import { Film, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  duration?: number;
}

const FORMAT_OPTIONS = [
  { id: "mp4", label: "MP4", description: "Best compatibility, smaller file size" },
  { id: "webm", label: "WebM", description: "Open format, optimized for web" },
  { id: "mkv", label: "MKV", description: "Container, maximum quality" },
  { id: "gif", label: "GIF", description: "Animated image — keep clips under 10 s" },
] as const;

export default function FormatSelector({ recipe, onChange, duration }: Props) {
  const effectiveEnd = recipe.trimEnd ?? (duration && duration > 0 ? duration : null);
  const clipLength = effectiveEnd !== null ? effectiveEnd - recipe.trimStart : 0;
  const isOverGifLimit = recipe.format === "gif" && clipLength > 10.05;

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <Film size={10} className="text-film-500 opacity-80" />
        <div className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
          Output Format
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {FORMAT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange({ format: option.id as "mp4" | "webm" | "mkv" | "gif" })}
            aria-label={`Select ${option.label} format`}
            aria-pressed={recipe.format === option.id}
            className={cn(
              "relative px-3 py-2.5 rounded-lg border-2 transition-all",
              "text-xs font-heading font-semibold uppercase tracking-wider",
              recipe.format === option.id
                ? "border-film-600 bg-film-50 text-film-600"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-film-400 hover:text-film-600"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--muted)] mt-2">
        {FORMAT_OPTIONS.find((o) => o.id === recipe.format)?.description}
      </p>

      {recipe.format === "gif" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400"
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="font-semibold">GIF Limit: Maximum 10 seconds</p>
            <p className="text-[11px] opacity-90">
              {isOverGifLimit
                ? `Clip is currently ${clipLength.toFixed(1)}s. Trimming to under 10s is required to prevent oversized files and browser freezes.`
                : "Clips are automatically capped under 10s to ensure fast generation and reasonable file sizes."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}