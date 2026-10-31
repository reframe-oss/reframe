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
              "flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-2 py-4 rounded-lg border border-transparent transition-all duration-150",
              active
                ? "neo-inset text-film-600"
                : "neo-pressable text-[var(--muted)]"
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
  );
}