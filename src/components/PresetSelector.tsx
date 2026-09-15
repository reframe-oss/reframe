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
  const MAX = 32;
  const ratio = width / height;
  const [w, h] =
    ratio >= 1
      ? [MAX, Math.max(4, Math.round(MAX / ratio))]
      : [Math.max(4, Math.round(MAX * ratio)), MAX];

  return (
    <div
      className={cn(
        "border-2 flex-shrink-0 rounded-sm transition-colors",
        active ? "border-film-600" : "border-white/40",
      )}
      style={{ width: w, height: h }}
    />
  );
}

const QUICK_ACTIONS = [
  {
    preset: "vertical-9-16",
    label: "Reels",
    platform: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    preset: "vertical-9-16",
    label: "TikTok",
    platform: "TikTok",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z" />
      </svg>
    ),
  },
  {
    preset: "vertical-9-16",
    label: "Short",
    platform: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    preset: "landscape-16-9",
    label: "YouTube",
    platform: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    preset: "twitter-hd",
    label: "Twitter/X",
    platform: "Twitter",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    ),
  },
] as const;

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
      {/* Quick-action row */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {QUICK_ACTIONS.map(({ preset, label, platform, icon }) => {
          const isActive = recipe.preset === preset;
          return (
            <button
              key={`${preset}-${label}`}
              type="button"
              aria-label={`${platform} ${label}`}
              aria-pressed={isActive}
              onClick={() => onChange({ preset })}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border text-center transition-all duration-150 cursor-pointer hover:scale-[1.04] active:scale-[0.97]",
                isActive
                  ? "border-film-500 bg-film-50 text-film-600"
                  : "border-slate-200 bg-slate-50 text-[var(--text)] dark:border-white/25 dark:bg-white/5 hover:border-film-400 hover:bg-film-50/50 dark:hover:bg-white/10 hover:text-film-600",
              )}
            >
              {icon}
              <span className={cn(
                "text-[9px] font-heading font-bold uppercase tracking-wide leading-none",
                isActive ? "text-film-700" : "text-[var(--text)]",
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search size={14} className="text-[var(--muted)]" />
        </div>
        <input
          type="text"
          placeholder="Search formats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm font-heading text-[var(--text)] transition-shadow focus:outline-none focus:ring-2 focus:ring-film-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                aria-label={`${preset.label.replaceAll(":", " is to ")} output ratio`}
                aria-pressed={active}
                className={cn(
                  "min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border text-center transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
                  active
                    ? "border-film-500 bg-film-50"
                    : "border-slate-200 bg-slate-50 dark:border-white/25 dark:bg-white/5 hover:border-film-400 hover:bg-film-50/50 dark:hover:bg-white/10 hover:shadow-sm",
                )}
              >
                <RatioBox
                  width={preset.width}
                  height={preset.height}
                  active={active}
                />

                <div className="min-w-0 w-full">
                  <p
                    className={cn(
                      "text-sm font-heading font-bold leading-tight",
                      active ? "text-film-700" : "text-[var(--text)]",
                    )}
                  >
                    {preset.label}
                  </p>

                  <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted)]">
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
          aria-label="Select custom dimensions preset"
          aria-pressed={recipe.preset === "custom"}
          onClick={() => handlePresetSelect("custom")}
          className={cn(
            "min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border text-center transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
            recipe.preset === "custom"
              ? "border-film-500 bg-film-50"
              : "border-slate-200 bg-slate-50 dark:border-white/25 dark:bg-white/5 hover:border-film-400 hover:bg-film-50/50 dark:hover:bg-white/10 hover:shadow-sm",
          )}
        >
          <Settings2
            size={20}
            className={cn(
              "shrink-0",
              recipe.preset === "custom"
                ? "text-film-600"
                : "text-[var(--muted)]",
            )}
          />
          <div className="min-w-0 w-full">
            <p
              className={cn(
                "text-sm font-heading font-bold",
                recipe.preset === "custom"
                  ? "text-film-700"
                  : "text-[var(--text)]",
              )}
            >
              Custom
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-[var(--muted)]">
              Set your own
            </p>
          </div>
        </button>
      </div>

      {recipe.preset === "custom" && (
        <div className="mt-2 flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm animate-fade-in">
          <div className="flex-1">
            <label
              htmlFor="custom-width"
              className="mb-1.5 block text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]"
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
              className="w-full min-w-20 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-heading transition-all focus:outline-none focus:ring-2 focus:ring-film-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="flex h-full flex-col items-center justify-center">
            <span className="font-heading text-sm font-medium text-[var(--muted)]">
              ×
            </span>
          </div>

          <div className="flex-1">
            <label
              htmlFor="custom-height"
              className="mb-1.5 block text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]"
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
              className="w-full min-w-20 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-heading transition-all focus:outline-none focus:ring-2 focus:ring-film-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="hidden h-full flex-col justify-end sm:flex">
            <span className="mb-1.5 block text-center text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
              Ratio
            </span>
            <div className="flex h-[38px] items-center rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-film-700">
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