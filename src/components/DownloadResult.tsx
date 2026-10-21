"use client";

import { useState, useEffect } from "react";
import { ExportResult } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { Download, RotateCcw, Share2, AlertCircle, Volume2, VolumeX } from "lucide-react";
import LottiePlayer from "./LottiePlayer";
import { NativeShareButton } from "./NativeShareButton";
import successAnim from "@/lib/lottie/success.json";
import { cn } from "@/lib/utils";

const SHARE_TWEET_TEXT =
  "I just edited my video with @reframevideo — free browser-based video editor! Check it out: https://github.com/reframe-oss/reframe";

function formatExportDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} sec`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} sec`;
}

interface Props {
  result: ExportResult;
  onReset: () => void;
  soundOnCompletion: boolean;
  onToggleSound: () => void;
}

export default function DownloadResult({ result, onReset, soundOnCompletion, onToggleSound }: Props) {
  const defaultName = `reframe_${result.width}x${result.height}`;
  const [name, setName] = useState(defaultName);

  const invalidCharRegex = /[<>:"/\\|?*]/;
  const isValid = !invalidCharRegex.test(name) && name.trim().length > 0;
  const filename = `${name.trim() || "untitled"}.${result.format}`;

  const shareHref = `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TWEET_TEXT)}`;

  const [soundError, setSoundError] = useState(false);

  useEffect(() => {
    if (soundOnCompletion) {
      const audio = new Audio("/sounds/export-complete.mp3");
      audio.play().catch((error) => {
        console.error("Failed to play completion sound:", error);
        setSoundError(true);
      });
    }
  }, [soundOnCompletion]);
  const handleReset = () => {
    if (window.confirm("This will clear the current video and all settings. Continue?")) {
      onReset();
    }
  };

  // The success animation plays once; with reduced motion it shows its first frame.
  const [reduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  return (
    <div className="panel space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0">
            <LottiePlayer animationData={successAnim} loop={false} autoplay={!reduceMotion} />
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Export complete</p>
            <p className="tabular text-xs text-[var(--muted)]">
              {result.format.toUpperCase()} · {result.width} × {result.height} · {formatBytes(result.size)}
              {typeof result.exportDurationMs === "number" &&
                ` · exported in ${formatExportDuration(result.exportDurationMs)}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOnCompletion ? "Mute completion sound" : "Unmute completion sound"}
          aria-pressed={soundOnCompletion}
          className="btn btn-ghost btn-icon btn-sm"
          title={soundOnCompletion ? "Completion sound on" : "Completion sound off"}
        >
          {soundOnCompletion ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
        </button>
      </div>

      {soundError && (
        <p className="hint">The completion sound couldn&apos;t play on this device.</p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="filename-input" className="label">
            File name
          </label>
          <span className={cn("tabular", name.length >= 100 ? "text-[var(--error)] font-medium" : "text-[var(--muted)]")}>
            {100 - name.length} characters left
          </span>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            id="filename-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            aria-invalid={!isValid && name.length > 0}
            aria-describedby={!isValid && name.length > 0 ? "filename-error" : undefined}
            className="field flex-1"
            placeholder="Enter a file name"
          />
          <span className="flex items-center rounded-control border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--muted)]">
            .{result.format}
          </span>
        </div>
        {!isValid && name.length > 0 && (
          <p id="filename-error" className="flex items-center gap-1.5 text-xs text-[var(--error)]">
            <AlertCircle size={12} aria-hidden="true" />
            Remove these characters: \ / : * ? &quot; &lt; &gt; |
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={isValid ? result.blobUrl : undefined}
          download={isValid ? filename : undefined}
          aria-disabled={!isValid}
          className="btn btn-primary btn-lg min-w-[10rem] flex-1"
          onClick={(e) => {
            if (!isValid) e.preventDefault();
          }}
        >
          <Download size={16} aria-hidden="true" />
          Download {result.format.toUpperCase()}
        </a>
        <NativeShareButton
          file={result.blob}
          fileName={filename}
          className="btn btn-secondary btn-lg min-w-[8rem] flex-1"
        />
        <a
          href={result.blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-lg"
          title="Open the exported video in a new tab"
        >
          Preview
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          title="Clear this video and its settings"
          onClick={handleReset}
          className="btn btn-ghost btn-sm"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Start over with a new video
        </button>
        <a
          href={shareHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          <Share2 size={13} aria-hidden="true" />
          Share Reframe on X
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
