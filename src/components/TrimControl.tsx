"use client";

import { EditRecipe } from "@/lib/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useAudioWaveform } from "@/hooks/useAudioWaveform";
import WaveformCanvas from "@/components/WaveformCanvas";

const MIN_CLIP_DURATION = 0.1;

interface Props {
  recipe: EditRecipe;
  onChange: (patch: Partial<EditRecipe>) => void;
  duration: number;
  file: File | null;
}

export default function TrimControl({ recipe, onChange, duration, file }: Props) {
  const [invalidStart, setStart] = useState(false);
  const [invalidEnd, setEnd] = useState(false);
  const [startErrorMsg, setStartErrorMsg] = useState("");
  const [endErrorMsg, setEndErrorMsg] = useState("");
  const [startInput, setStartInput] = useState(
    recipe.trimStart.toString()
  );

  const { waveform, isLoading: waveformLoading } = useAudioWaveform(file);
  const hasAudio = waveform.length > 0;

  useEffect(() => {
    setStartInput(recipe.trimStart.toString());
  }, [recipe.trimStart]);

  const clipLength =
    (recipe.trimEnd ?? duration) - recipe.trimStart;

  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  const xToSeconds = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const { left, width } = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
    return parseFloat((ratio * duration).toFixed(1));
  }, [duration]);

  const applyDrag = useCallback((clientX: number) => {
    const seconds = xToSeconds(clientX);
    if (dragging.current === "start") {
      const clamped = Math.min(seconds, (recipe.trimEnd ?? duration) - 0.1);
      onChange({ trimStart: Math.max(0, clamped) });
    } else if (dragging.current === "end") {
      const clamped = Math.max(seconds, recipe.trimStart + 0.1);
      onChange({ trimEnd: Math.min(duration, clamped) });
    }
  }, [xToSeconds, duration, recipe.trimStart, recipe.trimEnd, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      let clientX: number;

      if ("touches" in e) {
        const touch = e.touches[0];

        if (!touch) return;

        clientX = touch.clientX;
      } else {
        clientX = e.clientX;
      }

      applyDrag(clientX);
    };

    const onUp = () => {
      dragging.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onUp);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [applyDrag]);

  const handleStart = (val: string) => {
    setStartInput(val);

    if (val === "") {
      setStart(false);
      setStartErrorMsg("");
      return;
    }

    const n = parseFloat(val);

    if (isNaN(n)) {
      setStart(true);
      setStartErrorMsg("Enter a valid number.");
      return;
    }

    if (n < 0) {
      setStart(true);
      setStartErrorMsg("Start time must be 0 or greater.");
      return;
    }

    if (duration > 0 && n >= duration) {
      setStart(true);
      setStartErrorMsg(
        `Start time must be less than duration (${duration.toFixed(1)}s).`
      );
      return;
    }

    if (recipe.trimEnd !== null && n >= recipe.trimEnd - MIN_CLIP_DURATION) {
      setStart(true);
      setStartErrorMsg("Start time must be less than the end time.");
      return;
    }

    setStart(false);
    setStartErrorMsg("");
    onChange({ trimStart: n });
  };

  const handleEnd = (val: string) => {
    if (val === "") {
      onChange({ trimEnd: null });
      setEnd(false);
      return;
    }

    const n = parseFloat(val);

    if (isNaN(n)) {
      setEnd(true);
      setEndErrorMsg("Enter a valid number.");
      return;
    }

    if (n <= 0) {
      setEnd(true);
      setEndErrorMsg("End time must be greater than 0.");
      return;
    }

    if (n <= recipe.trimStart + MIN_CLIP_DURATION) {
      setEnd(true);
      setEndErrorMsg("End time must be greater than start time.");
      return;
    }

    if (duration > 0 && n > duration + 0.01) {
      setEnd(true);
      setEndErrorMsg(
        `End time cannot exceed duration (${duration.toFixed(1)}s).`,
      );
      return;
    }

    setEnd(false);
    setEndErrorMsg("");
    onChange({ trimEnd: n });
  };

  const inputClass =
    "w-full text-sm px-3 py-2 border rounded-md bg-[var(--bg)] font-heading focus:outline-none focus:ring-2 focus:ring-film-400 text-[var(--text)] transition-shadow [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div id="trim-control" className="space-y-3">
      {duration > 0 && (
        <div
          role="toolbar"
          aria-label="Trim timeline"
          ref={trackRef}
          className="relative h-6 flex items-center cursor-pointer select-none"
          onClick={(e) => {
            if (dragging.current) return;
            const s = xToSeconds(e.clientX);
            onChange({ trimStart: s });
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onChange({ trimStart: Math.max(0, recipe.trimStart - 0.1) });
            if (e.key === "ArrowRight") onChange({ trimStart: Math.min((recipe.trimEnd ?? duration) - 0.1, recipe.trimStart + 0.1) });
          }}
        >
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--border)]" />
          <div
            className="absolute h-1.5 rounded-full bg-film-400 opacity-60"
            style={{
              left: `${(recipe.trimStart / duration) * 100}%`,
              right: `${((duration - (recipe.trimEnd ?? duration)) / duration) * 100}%`,
            }}
          />
          <div
            role="slider"
            aria-label="Trim start"
            aria-valuenow={recipe.trimStart}
            aria-valuemin={0}
            aria-valuemax={duration}
            tabIndex={0}
            className="absolute w-4 h-4 rounded-full bg-white border-2 border-film-400 shadow cursor-grab active:cursor-grabbing -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-film-400"
            style={{ left: `${(recipe.trimStart / duration) * 100}%` }}
            onMouseDown={() => { dragging.current = "start"; }}
            onTouchStart={() => { dragging.current = "start"; }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") onChange({ trimStart: Math.max(0, recipe.trimStart - 0.1) });
              if (e.key === "ArrowRight") onChange({ trimStart: Math.min((recipe.trimEnd ?? duration) - 0.1, recipe.trimStart + 0.1) });
            }}
          />
          <div
            role="slider"
            aria-label="Trim end"
            aria-valuenow={recipe.trimEnd ?? duration}
            aria-valuemin={0}
            aria-valuemax={duration}
            tabIndex={0}
            className="absolute w-4 h-4 rounded-full bg-white border-2 border-film-400 shadow cursor-grab active:cursor-grabbing -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-film-400"
            style={{ left: `${((recipe.trimEnd ?? duration) / duration) * 100}%` }}
            onMouseDown={() => { dragging.current = "end"; }}
            onTouchStart={() => { dragging.current = "end"; }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") onChange({ trimEnd: Math.max(recipe.trimStart + 0.1, (recipe.trimEnd ?? duration) - 0.1) });
              if (e.key === "ArrowRight") onChange({ trimEnd: Math.min(duration, (recipe.trimEnd ?? duration) + 0.1) });
            }}
          />
        </div>
      )}
      <div className="flex gap-3">
        <div className="flex-1">
          <label
            htmlFor="trim-start"
            className="font-heading mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Start (sec)
          </label>

          <input
            id="trim-start"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            min={0}
            max={duration > 0 ? duration : undefined}
            step={0.1}
            value={startInput}
            spellCheck={false}
            onChange={(e) => handleStart(e.target.value)}
            aria-label="Trim start time in seconds"
            aria-invalid={invalidStart}
            aria-describedby={invalidStart ? "trim-start-error" : undefined}
            className={`${inputClass} ${invalidStart
                ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                : "border-[var(--border)]"
              }`}
            placeholder="0"
          />
          {invalidStart && (
            <p
              id="trim-start-error"
              className="font-heading animate-fade-in mt-1.5 flex items-center gap-1 text-[10px] text-red-500"
            >
              <AlertCircle size={10} className="shrink-0" />
              {startErrorMsg}
            </p>
          )}
        </div>

        <div className="flex-1">
          <label
            htmlFor="trim-end"
            className="font-heading mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            End (sec)
          </label>

          <input
            id="trim-end"
            type="number"
            inputMode="decimal"
            autoComplete="off"
            min={0}
            max={duration > 0 ? duration : undefined}
            step={0.1}
            value={recipe.trimEnd ?? ""}
            spellCheck={false}
            onChange={(e) => handleEnd(e.target.value)}
            aria-label="Trim end time in seconds"
            aria-invalid={invalidEnd}
            aria-describedby={invalidEnd ? "trim-end-error" : undefined}
            className={`${inputClass} ${invalidEnd
                ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                : "border-[var(--border)]"
              }`}
            placeholder={duration > 0 ? `${duration.toFixed(1)}` : "full length"}
          />
          {invalidEnd && (
            <p
              id="trim-end-error"
              className="font-heading animate-fade-in mt-1.5 flex items-center gap-1 text-[10px] text-red-500"
            >
              <AlertCircle size={10} className="shrink-0" />
              {endErrorMsg}
            </p>
          )}
        </div>
      </div>

      {duration > 0 && (
        <p className="text-sm text-[var(--muted)] font-heading mt-1">
          Clip: {formatDuration(clipLength)} of{" "}
          {formatDuration(duration)}
        </p>
      )}
      {recipe.trimEnd !== null &&
        recipe.trimEnd - recipe.trimStart < MIN_CLIP_DURATION && (
          <p className="text-[10px] text-[var(--error)] font-heading">
            Clip must be at least 0.1 seconds long.
          </p>
        )}
    </div>
  );
}