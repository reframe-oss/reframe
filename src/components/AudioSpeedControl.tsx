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
    if (speed <= 0.5) return "Very slow";
    if (speed < 1) return "Slow";
    if (speed === 1) return "Normal";
    if (speed <= 1.5) return "Fast";
    return "Very fast";
  };

  const isModified = recipe.speed !== 1 || !recipe.keepAudio;

  // TS FIX: Guarantee a number is always passed to the UI and functions
  const currentSpeed = SPEED_STEPS[localSpeedIndex] ?? 1;

  return (
    <div className="space-y-4">
      {/* CLS FIX: Fixed height wrapper (h-6) ensures the layout never jumps. */}
      <div className="flex h-8 justify-end">
        <button
          type="button"
          aria-label="Reset audio settings to default"
          onClick={() => onChange({ speed: 1, keepAudio: true })}
          className={cn(
            "btn btn-ghost btn-sm transition-opacity duration-fast",
            isModified ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          tabIndex={isModified ? undefined : -1}
          aria-hidden={!isModified}
        >
          Reset audio and speed
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange({ keepAudio: !recipe.keepAudio })}
        aria-label={recipe.keepAudio ? "Mute video audio (M)" : "Unmute video audio (M)"}
        aria-pressed={recipe.keepAudio}
        className="choice flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {recipe.keepAudio ? (
          <Volume2 size={16} aria-hidden="true" />
        ) : (
          <VolumeX size={16} aria-hidden="true" />
        )}
        <span className="sr-only">
          {recipe.keepAudio ? "Turn audio off" : "Turn audio on"}
        </span>
        <span className="flex-1 text-left text-sm font-medium">
          {recipe.keepAudio ? "Audio on" : "Muted"}
        </span>
        <kbd
          aria-hidden="true"
          className="kbd ml-auto"
        >
          M
        </kbd>
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            id="speed-label"
            htmlFor="speed-control"
            className="label flex items-center gap-1.5"
          >
            <Gauge size={13} aria-hidden="true" /> Speed
          </label>

          <div className="text-right">
            <span className="tabular block text-sm font-medium text-[var(--text)]">
              {currentSpeed}x
            </span>
            <span id="speed-description" className="hint">
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
          className="h-8 w-full cursor-pointer"
        />
        <div className="mt-2 flex gap-1.5">
  {[0.5, 1, 1.5, 2].map((speed) => (
    <button
      key={speed}
      type="button"
      onClick={() => onChange({ speed })}
      aria-label={`Set speed to ${speed}x`}
      aria-pressed={recipe.speed === speed}
      className="choice tabular min-h-[32px] flex-1 text-xs font-medium"
    >
      {speed}x
    </button>
  ))}
</div>
        <div className="flex justify-between mt-1 overflow-hidden">
          {SPEED_STEPS.map((s) => (
            <span
              key={s}
              className="tabular min-w-0 truncate px-[1px] text-center text-2xs text-[var(--muted)]"
            >
              {s}x
            </span>
          ))}
        </div>
      </div>

      <div className={cn(!recipe.keepAudio && "opacity-50 pointer-events-none")}>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="volume-control"
            className="label flex items-center gap-1.5"
          >
            <Volume2 size={13} aria-hidden="true" /> Volume
          </label>

          <span className="tabular block text-sm font-medium text-[var(--text)]">
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
          className="h-8 w-full cursor-pointer"
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
          className="choice flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <Gauge size={16} aria-hidden="true" />
          <div className="flex-1 text-left">
            <span className="block text-sm font-medium">
              Normalize loudness
            </span>
            <span id="normalize-audio-description" className="text-2xs text-[var(--muted)]">
              {recipe.normalizeAudio ? "–14 LUFS (streaming standard)" : "Off"}
            </span>
          </div>
        </button>
      )}

      {recipe.keepAudio && (recipe.trimStart !== 0 || recipe.trimEnd !== null) && (
        <div role="note" className="callout callout-info text-xs">
          <AlertTriangle size={12} aria-hidden="true" className="shrink-0 mt-0.5" />
          <p>
            Note: If audio doesn&apos;t start within the selected range, the output will be silent.
          </p>
        </div>
      )}
    </div>
  );
}