"use client";

import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
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
            className="label flex items-center gap-1.5"
          >
                        Quality

            <span
              className="cursor-help"
              title="CRF (Constant Rate Factor): lower = higher quality, larger file. 18 = best quality, 30 = smallest file."
            >
              <InfoIcon size={13} aria-hidden="true" />
            </span>
          </label>

          <span className="text-sm font-medium text-[var(--text)]">
            {label}

            <span className="tabular ml-1.5 text-xs font-normal text-[var(--muted)]">
              CRF {recipe.quality}
            </span>
          </span>
        </div>

        <input
          id="quality-control"
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
          className="w-full cursor-pointer"
        />

        <div
          id="quality-description"
          className="mt-1 space-y-3"
        >
          <div className="flex justify-between">
            <span className="hint">
              Smallest file
            </span>

            <span className="hint">
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
              GIF files can be very large. Keep clips under 10 s for best results.
            </p>
          )}
        </div>

        {!isGif && (
        <div className="flex items-center justify-between mt-4">
          <label
            htmlFor="sound-on-completion"
            className="label"
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
            className="h-4 w-4 cursor-pointer"
          />
        </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="stabilization-toggle"
            className="label flex items-center gap-1.5"
          >
                        Stabilization
          </label>

          <span className="flex">
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
              className="h-4 w-4 cursor-pointer"
            />
          </span>
        </div>

        <p className="hint mb-1">
          Reduce camera shake
        </p>

        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs",
              recipe.stabilization
                ? "text-[var(--warning)] font-medium"
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
            className="label flex items-center gap-1.5"
          >
                        Reduce noise

            <span
              className="cursor-help"
              title="Reduces video noise. May slow down export slightly."
            >
              <InfoIcon size={13} aria-hidden="true" />
            </span>
          </label>

          <span className="flex">
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
              className="h-4 w-4 cursor-pointer"
            />
          </span>
        </div>

        <p className="hint mb-1">
          Reduce low-light video grain
        </p>

        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs",
              recipe.denoise
                ? "text-[var(--warning)] font-medium"
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
