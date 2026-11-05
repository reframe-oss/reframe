"use client";

import { useRef, useState } from "react";
import { Music, X } from "lucide-react";
import { formatBytes } from "@/lib/ffmpeg";
import { trackFeature } from "@/lib/featureTelemetry";
import { cn } from "@/lib/utils";

/** A soundtrack is held in memory for the export; larger files aren't music. */
export const MAX_SOUNDTRACK_BYTES = 200 * 1024 * 1024;
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i;

/** Whether `file` looks like a sound file the engine can read. */
export function isAudioFile(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  replace: boolean;
  onReplaceChange: (replace: boolean) => void;
  trackVolume: number;
  onTrackVolumeChange: (volume: number) => void;
  videoVolume: number;
  onVideoVolumeChange: (volume: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  /** The video's sound is off, which also leaves the soundtrack out. */
  muted: boolean;
}

/**
 * A soundtrack for the export: replaces the video's sound or is mixed with
 * it, with its own volume, and loops if it's shorter than the video.
 */
export default function SoundtrackControl({
  file,
  onFileChange,
  replace,
  onReplaceChange,
  trackVolume,
  onTrackVolumeChange,
  videoVolume,
  onVideoVolumeChange,
  loop,
  onLoopChange,
  muted,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    if (!isAudioFile(picked)) {
      setError("Choose a sound file: MP3, WAV, M4A, AAC, OGG or FLAC.");
      return;
    }
    if (picked.size > MAX_SOUNDTRACK_BYTES) {
      setError("That file is over 200 MB. Choose a shorter track.");
      return;
    }
    setError(null);
    onFileChange(picked);
    trackFeature("soundtrack", "add");
  };

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-4">
      <div className="label flex items-center gap-1.5">
        <Music size={13} aria-hidden="true" /> Soundtrack
      </div>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="soundtrack-input"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => input.current?.click()}>
          Add a track
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-control border border-[var(--border)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--text)]" title={file.name}>
                {file.name}
              </p>
              <p className="tabular text-2xs text-[var(--muted)]">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Remove track"
              onClick={() => {
                onFileChange(null);
                trackFeature("soundtrack", "remove");
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div role="radiogroup" aria-label="How the track is used" className="grid grid-cols-2 gap-1.5">
            {[
              { value: true, label: "Replace the video's sound" },
              { value: false, label: "Mix with it" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={replace === option.value}
                onClick={() => {
                  onReplaceChange(option.value);
                  trackFeature("soundtrack", option.value ? "replace" : "mix");
                }}
                className="choice min-h-[36px] px-2 text-xs font-medium"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="track-volume" className="label">
                Track volume
              </label>
              <span className="tabular text-sm font-medium">{trackVolume}%</span>
            </div>
            <input
              id="track-volume"
              type="range"
              min={0}
              max={200}
              step={1}
              value={trackVolume}
              onChange={(e) => onTrackVolumeChange(Number(e.target.value))}
              className="h-8 w-full cursor-pointer"
            />
          </div>

          {!replace && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="video-sound-in-mix" className="label">
                  Video sound in the mix
                </label>
                <span className="tabular text-sm font-medium">{videoVolume}%</span>
              </div>
              <input
                id="video-sound-in-mix"
                type="range"
                min={0}
                max={200}
                step={1}
                value={videoVolume}
                onChange={(e) => onVideoVolumeChange(Number(e.target.value))}
                className="h-8 w-full cursor-pointer"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                onLoopChange(e.target.checked);
                if (e.target.checked) trackFeature("soundtrack", "loop");
              }}
              className="accent-film-600"
            />
            Loop the track if it&apos;s shorter than the video
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--error)]">
          {error}
        </p>
      )}
      {file && muted && (
        <p className={cn("text-xs text-[var(--warning)]")}>The sound is off, so the export has no soundtrack either.</p>
      )}
    </div>
  );
}
