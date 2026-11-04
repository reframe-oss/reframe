"use client";

import { CROP_ASPECTS, cropForAspect, cropPixels, FULL_FRAME, isFullFrame, MIN_CROP, clampCrop, type CropAspectId, type CropRect } from "@/lib/crop";
import { trackFeature } from "@/lib/featureTelemetry";
import { cn } from "@/lib/utils";

interface Props {
  crop: CropRect | null | undefined;
  aspect: CropAspectId;
  /** Width / height of the output size, for the "Output" aspect. */
  outputRatio: number;
  source: { width: number; height: number } | null;
  onAspectChange: (aspect: CropAspectId) => void;
  onChange: (crop: CropRect | null) => void;
}

export function aspectRatio(aspect: CropAspectId, outputRatio: number): number | null {
  if (aspect === "output") return outputRatio;
  return CROP_ASPECTS.find((a) => a.id === aspect)?.ratio ?? null;
}

const FIELDS = [
  { key: "x", label: "Left" },
  { key: "y", label: "Top" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
] as const;

/**
 * The crop settings: an aspect to keep, the box as percentages (the
 * keyboard-friendly way to set it; the box on the preview can be dragged),
 * the resulting size in pixels, and a reset.
 */
export default function CropControl({ crop, aspect, outputRatio, source, onAspectChange, onChange }: Props) {
  const rect = crop ?? FULL_FRAME;
  const sourceRatio = source && source.height > 0 ? source.width / source.height : 16 / 9;
  const choices: { id: CropAspectId; label: string }[] = [
    ...CROP_ASPECTS.map(({ id, label }) => ({ id, label })),
    { id: "output", label: "Output" },
  ];

  const chooseAspect = (id: CropAspectId) => {
    onAspectChange(id);
    trackFeature("crop_tool", "aspect");
    const ratio = aspectRatio(id, outputRatio);
    if (ratio) onChange(cropForAspect(ratio, sourceRatio, crop));
  };

  const setField = (key: (typeof FIELDS)[number]["key"], percent: number) => {
    if (!Number.isFinite(percent)) return;
    const value = Math.min(100, Math.max(key === "width" || key === "height" ? MIN_CROP * 100 : 0, percent)) / 100;
    onChange(clampCrop({ ...rect, [key]: value }));
  };

  const pixels = source ? cropPixels(rect, source.width, source.height) : null;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Crop shape" className="grid grid-cols-3 gap-1.5">
        {choices.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={aspect === id}
            onClick={() => chooseAspect(id)}
            className="choice tabular min-h-[40px] px-2 py-1.5 text-sm"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="label mb-1 block">{label} %</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={1}
              aria-label={`Crop ${label.toLowerCase()} in percent`}
              value={Math.round(rect[key] * 1000) / 10}
              onChange={(e) => setField(key, Number(e.target.value))}
              disabled={aspect !== "free" && (key === "width" || key === "height")}
              className={cn("field tabular w-full px-2", aspect !== "free" && (key === "width" || key === "height") && "opacity-60")}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span className="tabular" aria-live="polite">
          {isFullFrame(crop) ? "Whole frame" : pixels ? `Keeps ${pixels.width} × ${pixels.height} px` : "Cropped"}
        </span>
        <button
          type="button"
          disabled={isFullFrame(crop)}
          onClick={() => {
            onAspectChange("free");
            onChange(null);
            trackFeature("crop_tool", "reset");
          }}
          className="btn btn-ghost btn-sm"
        >
          Reset crop
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Drag the box on the preview to move it, or its edges to resize. The crop is applied before rotation and resizing.
      </p>
    </div>
  );
}
