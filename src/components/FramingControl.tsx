"use client";

import { EditRecipe } from "@/lib/types";
import { Maximize2, Crop } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

export default function FramingControl({ recipe, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["fit", "fill"] as const).map((mode) => {
          const Icon = mode === "fit" ? Maximize2 : Crop;
          const active = recipe.framing === mode;
          return (
            <button
              type="button"
              key={mode}
              title={mode === "fit" ? "Fit: Adds black bars (letterbox) to fill empty space" : "Fill: Crops the video to fill the entire frame"}
              onClick={() => onChange({ framing: mode })}
              className={cn(
                "flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-2 py-4 rounded-lg border transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]",
                active
                  ? "border-film-500 bg-film-50 text-film-700"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-film-300 bg-[var(--surface)]"
              )}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="sr-only">
                Set framing to {mode === "fit" ? "fit within frame" : "fill frame by cropping"}
              </span>
              <div className="text-center">
                <p className="text-xs font-heading font-semibold uppercase tracking-wider">
                  {mode === "fit" ? "Fit" : "Fill"}
                </p>
                <p className="text-[10px] text-[var(--muted)] mt-0.5">
                  {mode === "fit" ? "Letterbox / pillarbox" : "Crop to frame"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {recipe.framing === "fit" && (
        <div className="border-t pt-4 border-[var(--border)] w-full">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2 block">
            Padding Style
          </label>
          <div className="flex gap-2">
            {(["black", "blurred"] as const).map((style) => (
              <button
                key={style}
                onClick={() => onChange({ fitBackground: style })}
                className={cn(
                  "flex-1 min-h-[36px] text-sm rounded border transition-all duration-150",
                  (recipe.fitBackground || "black") === style
                    ? "border-film-500 bg-film-50 text-film-700 font-medium"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-film-300 bg-[var(--surface)]"
                )}
              >
                {style === "black" ? "Solid Black" : "Blurred Video"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}