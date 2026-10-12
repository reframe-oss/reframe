"use client";

import { useRef } from "react";
import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

const ROTATIONS = [0, 90, 180, 270] as const;

export default function RotateControl({ recipe, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % ROTATIONS.length;
      e.preventDefault();
    }

    if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + ROTATIONS.length) % ROTATIONS.length;
      e.preventDefault();
    }

    if (nextIndex !== index) {
      onChange({ rotate: ROTATIONS[nextIndex] });

      requestAnimationFrame(() => {
        refs.current[nextIndex]?.focus();
      });
    }
  };

  return (
    <div role="radiogroup" aria-label="Rotation" className="flex gap-2">
      {ROTATIONS.map((deg, index) => {
        const active = recipe.rotate === deg;
        const noneSelected = !ROTATIONS.includes(
          recipe.rotate as 0 | 90 | 180 | 270,
        );

        return (
          <button
            type="button"
            key={deg}
            ref={(el) => {
              refs.current[index] = el;
            }}
            onClick={() => onChange({ rotate: deg })}
            role="radio"
            aria-checked={active}
            tabIndex={active || (noneSelected && index === 0) ? 0 : -1}
            //  tabIndex={active ? 0 : -1}

            onKeyDown={(e) => handleKeyDown(e, index)}
            aria-label={`Rotate video to ${deg} degrees`}

            active={active}
            className="flex-1 flex flex-col items-center gap-1.5 py-3"

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

              style={{
                transform: `rotate(${deg}deg)`,
                transformOrigin: "center",
              }}
              className="transition-transform"
            />

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
