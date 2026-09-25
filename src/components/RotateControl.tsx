"use client";

import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

const PRESETS = [0, 90, 180, 270] as const;

export default function RotateControl({ recipe, onChange }: Props) {
  const rotation = recipe.rotate ?? 0;

  const handleSlider = (val: number) => {
    onChange({ rotate: val });
  };

  const handleInput = (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    const clamped = Math.min(180, Math.max(-180, n));
    onChange({ rotate: clamped });
  };

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
    <div className="space-y-3">

      {/* Preset buttons */}
      <div className="flex gap-2">
        {PRESETS.map((deg) => {
          const active = rotation === deg;
          return (
            <button
              type="button"
              key={deg}
              onClick={() => onChange({ rotate: deg })}
              aria-label={`Rotate video to ${deg} degrees`}
              aria-pressed={active}
              className={cn(
                "flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border text-xs transition-all duration-150 cursor-pointer hover:scale-[1.03] active:scale-[0.97]",
                active
                  ? "border-film-500 bg-film-50 text-film-700 font-heading font-semibold"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-film-300 bg-[var(--surface)]"
              )}
            >
              <RotateCw size={15} style={{ transform: `rotate(${deg}deg)` }} className="transition-transform" />
              <span className="sr-only">Rotate video to {deg} degrees</span>
              {deg}
            </button>
          );
        })}
      </div>

      {/* Custom rotation slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label htmlFor="rotate-slider" className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
            Custom Rotation
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => handleInput(e.target.value)}
              className="w-16 text-xs px-2 py-1 border border-[var(--border)] rounded-md bg-[var(--bg)] font-heading text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-film-400 text-center"
            />
            <span className="text-[10px] text-[var(--muted)] font-heading">°</span>
          </div>
        </div>
        <input
          id="rotate-slider"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={rotation}
          onChange={(e) => handleSlider(parseFloat(e.target.value))}
          className="w-full h-1.5 appearance-none bg-[var(--border)] rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-film-400 [&::-webkit-slider-thumb]:shadow-md"
        />
        <div className="flex justify-between text-[10px] text-[var(--muted)] font-heading">
          <span>-180°</span>
          <span>0°</span>
          <span>180°</span>
        </div>
      </div>

    </div>
  );
}