"use client";

import { useState } from "react";
import { EditRecipe } from "@/lib/types";
import { SPEED_STEPS } from "@/lib/constants";
import { Volume2, VolumeX, Gauge, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
}

export default function AudioSpeedControl({ recipe, onChange }: Props) {
  // --- STATE FOR SMOOTH SLIDER DRAGGING ---
  const parentSpeedIndex = SPEED_STEPS.indexOf(recipe.speed as (typeof SPEED_STEPS)[number]);
  const safeParentIndex = parentSpeedIndex === -1 ? 3 : parentSpeedIndex;
  const [localSpeedIndex, setLocalSpeedIndex] = useState(safeParentIndex);
  // Mirror the parent's speed into local state without an effect: adjust
  // state during render when the incoming prop changes (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevSafeParentIndex, setPrevSafeParentIndex] = useState(safeParentIndex);
  if (safeParentIndex !== prevSafeParentIndex) {
    setPrevSafeParentIndex(safeParentIndex);
    setLocalSpeedIndex(safeParentIndex);
  }
  // ----------------------------------------

  const getSpeedDescription = (speed: number) => {
    if (speed <= 0.5) return "Very Slow";
    if (speed < 1) return "Slow";
    if (speed === 1) return "Normal";
    if (speed <= 1.5) return "Fast";
    return "Very Fast";
  };

  const isModified = recipe.speed !== 1 || !recipe.keepAudio;

  // TS FIX: Guarantee a number is always passed to the UI and functions
  const currentSpeed = SPEED_STEPS[localSpeedIndex] ?? 1;

  return (
    <div className="space-y-4">
      {/* CLS FIX: Fixed height wrapper (h-6) ensures the layout never jumps. */}
      <div className="h-6 flex justify-end">
        <button
          type="button"
          aria-label="Reset audio settings to default"
          onClick={() => onChange({ speed: 1, keepAudio: true })}
          className={cn(
            "text-sm font-heading font-semibold uppercase tracking-wider text-film-600 hover:text-film-700 hover:underline transition-all duration-300 ease-in-out",
            isModified 
              ? "opacity-100 translate-y-0 pointer-events-auto delay-200" 
              : "opacity-0 -translate-y-1 pointer-events-none"
          )}
        >
          Reset to Default
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange({ keepAudio: !recipe.keepAudio })}
        aria-label={recipe.keepAudio ? "Mute video audio (M)" : "Unmute video audio (M)"}
        aria-pressed={recipe.keepAudio}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-150",
          "hover:scale-[1.01] active:scale-[0.99]",
          recipe.keepAudio
            ? "border-film-300 bg-film-50 text-film-700"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
        )}
      >
        {recipe.keepAudio ? (
          <Volume2 size={16} aria-hidden="true" />
        ) : (
          <VolumeX size={16} aria-hidden="true" />
        )}
        <span className="sr-only">
          {recipe.keepAudio ? "Turn audio off" : "Turn audio on"}
        </span>
        <span className="text-sm font-heading font-semibold flex-1 text-left">
          {recipe.keepAudio ? "Audio on" : "Muted"}
        </span>
        <kbd
          aria-hidden="true"
          className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-current opacity-40"
        >
          M
        </kbd>
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            id="speed-label"
            htmlFor="speed-control"
            className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2"
          >
            <Gauge size={10} aria-hidden="true" /> Speed
          </label>

          <div className="text-right">
            <span className="text-sm font-heading font-bold text-film-600 block">
              {currentSpeed}x
            </span>
            <span id="speed-description" className="text-sm text-[var(--muted)]">
              {getSpeedDescription(currentSpeed)}
            </span>
          </div>
        </div>
        <input
          id="speed-control"
          type="range"
          min={0}
          max={SPEED_STEPS.length - 1}
          step={1}
          value={localSpeedIndex}
          onChange={(e) => {
            setLocalSpeedIndex(Number(e.target.value));
          }}
          onPointerUp={(e) => {
            onChange({ speed: SPEED_STEPS[Number(e.currentTarget.value)] });
          }}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              onChange({ speed: SPEED_STEPS[Number(e.currentTarget.value)] });
            }
          }}
          aria-labelledby="speed-label"
          aria-describedby="speed-description"
          aria-valuetext={`${currentSpeed}x speed, ${getSpeedDescription(currentSpeed)}`}
          className="w-full h-11 accent-film-600 cursor-pointer"
        />
        <div className="flex gap-2 mt-3">
  {[0.5, 1, 1.5, 2].map((speed) => (
    <button
      key={speed}
      type="button"
      onClick={() => onChange({ speed })}
      aria-label={`Set speed to ${speed}x`}
      aria-pressed={recipe.speed === speed}
      className={cn(
        "flex-1 py-1.5 rounded-lg text-xs font-heading font-bold transition-all duration-150",
        "hover:scale-[1.02] active:scale-[0.98]",
        recipe.speed === speed
          ? "bg-film-600 text-white"
          : "bg-[var(--border)] text-[var(--muted)] hover:bg-film-50 hover:text-film-600"
      )}
    >
      {speed}x
    </button>
  ))}
</div>
        <div className="flex justify-between mt-1 overflow-hidden">
          {SPEED_STEPS.map((s) => (
            <span
              key={s}
              className="text-sm text-[var(--muted)] truncate text-center min-w-0 px-[1px]"
            >
              {s}x
            </span>
          ))}
        </div>
      </div>

      <div className={cn("transition-opacity duration-200", !recipe.keepAudio && "opacity-50 pointer-events-none")}>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="volume-control"
            className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-2"
          >
            <Volume2 size={10} aria-hidden="true" /> Volume
          </label>

          <span className="text-sm font-heading font-bold text-film-600 block">
            {recipe.volume}%
          </span>
        </div>
        <input
          id="volume-control"
          type="range"
          min={0}
          max={200}
          step={1}
          disabled={!recipe.keepAudio}
          value={recipe.volume ?? 100}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="w-full h-11 accent-film-600 cursor-pointer"
        />
      </div>

      {recipe.keepAudio && (
        <button
          type="button"
          onClick={() => onChange({ normalizeAudio: !recipe.normalizeAudio })}
          aria-label={
            recipe.normalizeAudio
            ? "Turn off audio normalization"
            : "Turn on audio normalization"
          }
          aria-pressed={recipe.normalizeAudio}
          aria-describedby="normalize-audio-description"
          className={cn(
            "w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-150",
            "hover:scale-[1.01] active:scale-[0.99]",
            recipe.normalizeAudio
              ? "border-film-300 bg-film-50 text-film-700"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
          )}
        >
          <Gauge size={16} aria-hidden="true" />
          <div className="flex-1 text-left">
            <span className="text-sm font-heading font-semibold block">
              Normalize Audio
            </span>
            <span id="normalize-audio-description" className="text-[10px] text-[var(--muted)]">
              {recipe.normalizeAudio ? "–14 LUFS (streaming standard)" : "Off"}
            </span>
          </div>
        </button>
      )}

      {recipe.keepAudio && (recipe.trimStart !== 0 || recipe.trimEnd !== null) && (
        <div role="note" className="mt-3 p-3 bg-[var(--accent-muted)] border border-[var(--border)] rounded text-sm text-[var(--text)] leading-relaxed flex items-start gap-2 animate-fade-in">
          <AlertTriangle size={12} aria-hidden="true" className="shrink-0 mt-0.5" />
          <p>
            Note: If audio doesn&apos;t start within the selected range, the output will be silent.
          </p>
        </div>
      )}
    </div>
  );
}