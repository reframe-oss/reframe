"use client";

import { EditRecipe } from "@/lib/types";
import { Palette, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

export default function ChromaKeyControl({ recipe, onChange }: Props) {
  return (
    <div className="bg-[var(--surface-dim)] rounded-xl p-4 border border-[var(--border)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Palette size={16} className="text-film-500" />
          <div className="text-xs font-heading font-bold uppercase tracking-wider text-[var(--foreground)]">
            Chroma Key (Green Screen)
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange({ chromaKeyEnabled: !recipe.chromaKeyEnabled })}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-film-500 focus-visible:ring-offset-2",
            recipe.chromaKeyEnabled ? "bg-film-600" : "bg-gray-400"
          )}
          role="switch"
          aria-checked={recipe.chromaKeyEnabled}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              recipe.chromaKeyEnabled ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {recipe.chromaKeyEnabled && (
        <div className="space-y-5 animate-in slide-in-from-top-2 fade-in duration-200">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
                Key Color
              </label>
              <span className="text-xs font-mono text-[var(--muted)]">
                {recipe.chromaKeyColor.toUpperCase()}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="color"
                value={recipe.chromaKeyColor}
                onChange={(e) => onChange({ chromaKeyColor: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                aria-label="Select chroma key color"
              />
              <div className="flex flex-1 gap-1">
                {["#00FF00", "#0000FF", "#FFFFFF", "#000000"].map((presetColor) => (
                  <button
                    key={presetColor}
                    type="button"
                    onClick={() => onChange({ chromaKeyColor: presetColor })}
                    className={cn(
                      "flex-1 rounded border-2 transition-all",
                      recipe.chromaKeyColor.toLowerCase() === presetColor.toLowerCase()
                        ? "border-film-500"
                        : "border-transparent hover:border-[var(--border)]"
                    )}
                    style={{ backgroundColor: presetColor }}
                    aria-label={`Select preset color ${presetColor}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
                Similarity
              </label>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                {Math.round(recipe.chromaKeySimilarity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="1.0"
              step="0.01"
              value={recipe.chromaKeySimilarity}
              onChange={(e) => onChange({ chromaKeySimilarity: parseFloat(e.target.value) })}
              className="w-full accent-film-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--muted)]">
                Smoothness / Blend
              </label>
              <span className="text-[10px] text-[var(--muted)] font-mono">
                {Math.round(recipe.chromaKeyBlend * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={recipe.chromaKeyBlend}
              onChange={(e) => onChange({ chromaKeyBlend: parseFloat(e.target.value) })}
              className="w-full accent-film-500"
            />
          </div>

          {recipe.format === "mp4" && (
            <div className="mt-3 flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-lg p-2.5">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p className="text-[10px] leading-tight">
                <strong>MP4 doesn't support transparency.</strong> Keyed out areas will appear black. Export as <strong>WebM</strong> or <strong>GIF</strong> for a transparent background.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
