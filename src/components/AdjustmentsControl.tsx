"use client";

import { EditRecipe } from "@/lib/types";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

type AdjustmentKey = "brightness" | "contrast" | "saturation" | "sharpness";

const ADJUSTMENTS: {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  format: (v: number) => string;
}[] = [
  { key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.1, neutral: 0, format: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
  { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.1, neutral: 1, format: (v) => `${v.toFixed(1)}×` },
  { key: "saturation", label: "Saturation", min: 0, max: 3, step: 0.1, neutral: 1, format: (v) => `${v.toFixed(1)}×` },
  { key: "sharpness", label: "Sharpness", min: 0, max: 3, step: 1, neutral: 0, format: (v) => (v === 0 ? "Off" : String(v)) },
];

export function hasAdjustments(recipe: EditRecipe) {
  return ADJUSTMENTS.some(({ key, neutral }) => recipe[key] !== neutral);
}

/** Brightness / contrast / saturation / sharpness sliders with per-control reset. */
export default function AdjustmentsControl({ recipe, onChange }: Props) {
  return (
    <div className="space-y-4">
      {ADJUSTMENTS.map(({ key, label, min, max, step, neutral, format }) => {
        const value = recipe[key];
        const id = `${key}-slider`;
        return (
          <div key={key}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={id} className="label">
                {label}
              </label>
              <div className="flex items-center gap-1">
                <span className="tabular text-xs text-[var(--muted)]">{format(value)}</span>
                <button
                  type="button"
                  onClick={() => onChange({ [key]: neutral })}
                  disabled={value === neutral}
                  className="btn btn-ghost btn-sm h-6 min-h-0 px-1.5 text-2xs"
                  aria-label={`Reset ${label.toLowerCase()}`}
                >
                  Reset
                </button>
              </div>
            </div>
            <input
              id={id}
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              aria-valuetext={format(value)}
              className="mt-1 w-full cursor-pointer"
            />
          </div>
        );
      })}
      <p className="hint">Brightness, contrast and saturation preview live; sharpness applies on export.</p>
    </div>
  );
}
