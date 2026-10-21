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
            aria-label={`${deg}° rotation`}
            aria-pressed={active}
            className="choice tabular flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center gap-1 px-3 py-2.5"
          >
            <RotateCw
              size={15}
              aria-hidden="true"
              style={{ transform: `rotate(${deg}deg)`, transformOrigin: "center" }}
              className={cn(active ? "text-film-500" : "text-[var(--muted)]")}
            />
            {deg}°
          </button>
        );
      })}
    </div>
  );
}
