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
            aria-pressed={active}
            className="choice flex min-h-[44px] min-w-[44px] flex-1 items-center gap-3 px-3 py-2.5 text-left"
          >
            <Icon size={16} aria-hidden="true" className={cn("shrink-0", active ? "text-[var(--selected)]" : "text-[var(--muted)]")} />
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                {mode === "fit" ? "Fit" : "Fill"}
              </p>
              <p className="text-2xs text-[var(--muted)]">
                {mode === "fit" ? "Letterbox / pillarbox" : "Crop to frame"}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}