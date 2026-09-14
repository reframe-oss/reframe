"use client";

import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  SlidersHorizontal,
  Info as InfoIcon,
} from "lucide-react";

import {
  estimateExportSize,
  formatEstimatedSize,
} from "@/lib/exportEstimate";

interface Props {
  recipe: EditRecipe;
  duration: number;
  onChange: (
    patch: Partial<EditRecipe>
  ) => void;
}

export default function ExportSettings({
  recipe,
  duration,
  onChange,
}: Props) {
  const label =
    recipe.quality <= 21
      ? "High"
      : recipe.quality <= 25
      ? "Balanced"
      : "Small file";

  const isGif = recipe.format === "gif";

  const estimatedSize =
    formatEstimatedSize(
      estimateExportSize(
        recipe,
        duration
      )
    );

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="quality-control"
            className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2"
          >
            <SlidersHorizontal size={10} />
            Quality

            <span
              className="cursor-help"
              title="CRF (Constant Rate Factor): lower = higher quality, larger file. 18 = best quality, 30 = smallest file."
            >
              <InfoIcon size={14} />
            </span>
          </label>

          <span className="text-sm font-heading font-bold text-film-600">
            {label}

            <span className="font-normal text-sm text-[var(--muted)] ml-2">
              CRF {recipe.quality}
            </span>
          </span>
        </div>

        <input
          id="quality-control"
          data-testid="quality-slider"
          type="range"
          min={18}
          max={30}
          step={1}
          value={48 - recipe.quality}
          onChange={(e) =>
            onChange({
              quality: 48 - Number(
                e.target.value
              ),
            })
          }
          aria-describedby="quality-description"
          aria-label="Video export quality (CRF)"
          aria-valuetext={`${label} quality, CRF value ${recipe.quality}`}
          className="w-full accent-film-600 cursor-pointer"
        />

        <div
          id="quality-description"
          className="mt-1 space-y-3"
        >
          <div className="flex justify-between">
            <span className="text-sm text-[var(--muted)]">
              Smallest file
            </span>

            <span className="text-sm text-[var(--muted)]">
              Best quality
            </span>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Estimated size:{" "}
            <span className="font-semibold text-[var(--text)]">
              {estimatedSize}
            </span>
          </p>

          {isGif && (
            <p className="text-xs text-[var(--warning)] font-medium">
              ⚠ GIF files can be very large. Keep clips under 10 s for best results.
            </p>
          )}
        </div>

        {!isGif && (
        <div className="flex items-center justify-between mt-4">
          <label
            htmlFor="sound-on-completion"
            className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Sound on completion
          </label>

          <input
            id="sound-on-completion"
            type="checkbox"
            checked={recipe.soundOnCompletion}
            onChange={(e) =>
              onChange({ soundOnCompletion: e.target.checked })
            }
            aria-label="Play sound when export completes"
            className="accent-film-600 cursor-pointer"
          />
        </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="stabilization-toggle"
            className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2"
          >
            <SlidersHorizontal size={10} />
            Stabilization
          </label>

          <span className="flex text-sm font-heading font-bold text-film-600">
            <input
              id="stabilization-toggle"
              type="checkbox"
              checked={recipe.stabilization}
              onChange={(e) =>
                onChange({
                  stabilization: e.target.checked,
                })
              }
              aria-label="Enable video stabilization"
              className="w-full accent-film-600 cursor-pointer"
            />
          </span>
        </div>

        <p className="text-xs text-[var(--muted)] mb-1">
          Reduce camera shake
        </p>

        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs",
              recipe.stabilization
                ? "text-[var(--error)] font-medium"
                : "text-[var(--muted)]"
            )}
          >
            Note: significantly increases processing time.
          </span>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="denoise-toggle"
            className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2"
          >
            <SlidersHorizontal size={10} />
            Reduce noise

            <span
              className="cursor-help"
              title="Reduces video noise. May slow down export slightly."
            >
              <InfoIcon size={14} />
            </span>
          </label>

          <span className="flex text-sm font-heading font-bold text-film-600">
            <input
              id="denoise-toggle"
              type="checkbox"
              checked={recipe.denoise}
              onChange={(e) =>
                onChange({
                  denoise: e.target.checked,
                })
              }
              aria-label="Enable noise reduction"
              aria-checked={recipe.denoise}
              className="w-full accent-film-600 cursor-pointer"
            />
          </span>
        </div>

        <p className="text-xs text-[var(--muted)] mb-1">
          Reduce low-light video grain
        </p>

        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs",
              recipe.denoise
                ? "text-red-700 font-medium"
                : "text-[var(--muted)]"
            )}
          >
            May slightly increase export time.
          </span>
        </div>
      </div>
    </>
  );
}
