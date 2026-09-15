"use client";

import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

const ROTATIONS = [0, 90, 180, 270] as const;

export default function RotateControl({ recipe, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {ROTATIONS.map((deg) => {
        const active = recipe.rotate === deg;
        return (
          <button
            type="button"
            key={deg}
            onClick={() => onChange({ rotate: deg })}
            aria-label={`Rotate video to ${deg} degrees`}
            aria-pressed={active}
            className={cn(
              "flex flex-1 min-h-[44px] min-w-[44px] flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              active
                ? "border-film-500 bg-film-50 text-film-700 font-heading font-semibold"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-film-300 hover:bg-film-50/30"
            )}
          >
            <RotateCw
              size={15}
              aria-hidden="true"
              style={{ transform: `rotate(${deg}deg)`, transformOrigin: "center" }}
              className="transition-transform"
            />
            <span className="sr-only">Rotate video to {deg} degrees</span>
            {deg}
          </button>
        );
      })}
    </div>
  );
}
