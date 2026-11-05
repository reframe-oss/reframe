"use client";

import { useCallback, useState } from "react";

import { Search, Settings2 } from "lucide-react";

import { PRESETS } from "@/lib/presets";
import { EditRecipe } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

function getOrientationLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const ratio = `${width / divisor}:${height / divisor}`;
  const orientation =
    width === height ? "Square" : width > height ? "Landscape" : "Portrait";
  return `${orientation} (${ratio})`;
}

function RatioBox({
  width,
  height,
  active,
}: {
  width: number;
  height: number;
  active: boolean;
}) {
  const MAX = 20;
  const ratio = width / height;
  const [w, h] =
    ratio >= 1
      ? [MAX, Math.max(4, Math.round(MAX / ratio))]
      : [Math.max(4, Math.round(MAX * ratio)), MAX];

  return (
    <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">
      <span
        className={cn(
          "rounded-[2px] border-[1.5px]",
          active ? "border-[var(--selected)]" : "border-[var(--muted)] opacity-60",
        )}
        style={{ width: w, height: h }}
      />
    </span>
  );
}

export default function PresetSelector({ recipe, onChange }: Props) {
  const [search, setSearch] = useState("");

  const filteredPresets = PRESETS.filter(
    (preset) =>
      preset.id !== "custom" &&
      (preset.label.toLowerCase().includes(search.toLowerCase()) ||
        preset.platform.toLowerCase().includes(search.toLowerCase())),
  );

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      onChange({ preset: presetId });
      setSearch("");
    },
    [onChange],
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      if (!isNaN(width) && width >= 16 && width <= 7680) {
        onChange({ customWidth: width });
      }
    },
    [onChange],
  );

  const handleHeightChange = useCallback(
    (height: number) => {
      if (!isNaN(height) && height >= 16 && height <= 7680) {
        onChange({ customHeight: height });
      }
    },
    [onChange],
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search size={14} className="text-[var(--muted)]" />
        </div>
        <input
          type="text"
          placeholder="Search presets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search presets"
          className="field pl-9"
        />
      </div>

      {/* Compact rows, so the whole list fits in the output panel's height. */}
      <div className="grid grid-cols-2 gap-1.5">
        {filteredPresets.length === 0 ? (
          <div className="col-span-full py-4 text-center text-sm text-[var(--muted)]">
            No presets found
          </div>
        ) : (
          filteredPresets.map((preset) => {
            const active = recipe.preset === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                title={`${preset.label} — ${preset.width}×${preset.height} — ${getOrientationLabel(preset.width, preset.height)}`}
                // "1 : 1" reads as "one colon one"; two presets share 16 : 9, so
                // the platform is part of the name too.
                aria-label={`${preset.label.replaceAll(":", " is to ")} output ratio, ${preset.platform}`}
                aria-pressed={active}
                className="choice flex min-h-[44px] min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
              >
                <RatioBox
                  width={preset.width}
                  height={preset.height}
                  active={active}
                />

                <div className="min-w-0 flex-1">
                  <p className="tabular truncate text-sm font-medium leading-tight text-[var(--text)]">
                    {preset.label}
                  </p>
                  <p className="mt-0.5 truncate text-2xs leading-tight text-[var(--muted)]">
                    {preset.platform}
                  </p>
                </div>
              </button>
            );
          })
        )}

        <button
          type="button"
          title="Custom — Set your own dimensions"
          aria-pressed={recipe.preset === "custom"}
          onClick={() => handlePresetSelect("custom")}
          className="choice flex min-h-[44px] min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
        >
          <Settings2
            size={18}
            aria-hidden="true"
            className={cn(
              "shrink-0",
              recipe.preset === "custom"
                ? "text-[var(--selected)]"
                : "text-[var(--muted)]",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-[var(--text)]">
              Custom
            </p>
            <p className="mt-0.5 truncate text-2xs leading-tight text-[var(--muted)]">
              Set your own
            </p>
          </div>
        </button>
      </div>

      {recipe.preset === "custom" && (
        <div className="mt-2 flex items-end gap-3 rounded-control bg-[var(--surface-2)] p-3">
          <div className="flex-1">
            <label
              htmlFor="custom-width"
              className="label mb-1 block"
            >
              Width
            </label>
            <input
              id="custom-width"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={16}
              max={7680}
              step={2}
              value={recipe.customWidth}
              onChange={(e) => handleWidthChange(Number(e.target.value))}
              className="field tabular min-w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="flex h-full flex-col items-center justify-center">
            <span className="pb-2 text-sm text-[var(--muted)]" aria-hidden="true">
              ×
            </span>
          </div>

          <div className="flex-1">
            <label
              htmlFor="custom-height"
              className="label mb-1 block"
            >
              Height
            </label>
            <input
              id="custom-height"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={16}
              max={7680}
              step={2}
              value={recipe.customHeight}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
              className="field tabular min-w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="hidden h-full flex-col justify-end sm:flex">
            <span className="label mb-1 block text-center">
              Ratio
            </span>
            <div className="flex h-9 items-center whitespace-nowrap rounded-control border border-[var(--border)] px-2 text-xs text-[var(--text-secondary)]">
              {getOrientationLabel(
                recipe.customWidth || 0,
                recipe.customHeight || 0,
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}