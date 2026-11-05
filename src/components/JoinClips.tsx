"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Undo2, X } from "lucide-react";
import { formatBytes } from "@/lib/ffmpeg";
import { cn, formatDuration } from "@/lib/utils";
import type { JoinClip, useJoinClips } from "@/hooks/useJoinClips";

interface Props {
  join: ReturnType<typeof useJoinClips>;
  /** An export or batch is using the engine. */
  engineBusy: boolean;
}

/** The clip's first frame, from the browser's own decoder (no engine needed). */
function ClipThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    // The object URL's lifetime is this effect's (revoked on cleanup).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="h-9 w-16 shrink-0 overflow-hidden rounded-[3px] bg-[var(--viewer)]" aria-hidden="true">
      {url && <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />}
    </div>
  );
}

function details(clip: JoinClip): string {
  if (clip.status === "reading") return "Reading…";
  if (clip.status === "error") return "Couldn't read this video";
  return `${formatDuration(clip.duration)} · ${clip.width} × ${clip.height} · ${formatBytes(clip.file.size)}`;
}

/**
 * Joins clips into one video: the editor's video first, then any added,
 * reordered by dragging or with the arrow buttons. The result becomes the
 * editor's video.
 */
export default function JoinClips({ join, engineBusy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const { clips, running } = join;
  const first = clips[0];
  const last = clips.length - 1;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-[var(--text-secondary)]">
        Put clips one after another to make a single video. Every clip is fitted to the first clip&apos;s size
        {first && first.status === "ready" ? ` (${first.width} × ${first.height})` : ""}; clips of another shape get
        bars rather than being stretched. Then trim, crop and export the joined video as usual.
      </p>

      <div
        onDragOver={(e) => {
          if (dragFrom !== null) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (dragFrom !== null) return;
          e.preventDefault();
          setDropping(false);
          if (!running) join.add([...e.dataTransfer.files]);
        }}
        className={cn(
          "rounded-control border border-dashed border-[var(--border)] p-3 transition-colors duration-fast",
          dropping && "border-[var(--accent)] bg-[var(--surface-2)]"
        )}
      >
        <input
          ref={input}
          type="file"
          // Distinct from the other video inputs: .mp4 listed explicitly.
          accept="video/*,.mp4,.mkv,.mov"
          multiple
          className="sr-only"
          aria-label="Add clips to join"
          data-testid="join-input"
          onChange={(e) => {
            join.add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm w-full" disabled={running} onClick={() => input.current?.click()}>
          <Plus size={14} aria-hidden="true" />
          Add clips
        </button>
        <p className="mt-2 text-center text-2xs text-[var(--muted)]">or drop them here</p>
      </div>

      {clips.length > 0 && (
        <ol aria-label="Clips to join, in order" className="divide-y divide-[var(--border)] rounded-control border border-[var(--border)]">
          {clips.map((clip, index) => (
            <li
              key={clip.id}
              data-status={clip.status}
              draggable={!running}
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                join.move(dragFrom, index);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={cn("flex items-center gap-2 px-2 py-2", dragFrom === index && "opacity-50")}
            >
              <GripVertical size={14} aria-hidden="true" className="shrink-0 cursor-grab text-[var(--muted)]" />
              <span className="tabular w-4 shrink-0 text-2xs text-[var(--muted)]">{index + 1}</span>
              <ClipThumb file={clip.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text)]" title={clip.file.name}>
                  {clip.file.name}
                </p>
                <p className={cn("tabular text-2xs", clip.status === "error" ? "text-[var(--error)]" : "text-[var(--muted)]")}>
                  {details(clip)}
                </p>
              </div>
              {!running && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5"
                    aria-label={`Move ${clip.file.name} earlier`}
                    disabled={index === 0}
                    onClick={() => join.move(index, index - 1)}
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5"
                    aria-label={`Move ${clip.file.name} later`}
                    disabled={index === last}
                    onClick={() => join.move(index, index + 1)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {clips.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-1.5"
                      aria-label={`Remove ${clip.file.name} from the join`}
                      onClick={() => join.remove(clip.id)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {running && (
        <div className="space-y-1.5">
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Joining clips"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(join.progress)}
          >
            <div className="progress-fill" style={{ transform: `scaleX(${Math.min(100, join.progress) / 100})` }} />
          </div>
          <p className="tabular text-xs text-[var(--muted)]" aria-live="polite">
            Joining… {Math.round(join.progress)}%
          </p>
        </div>
      )}

      {join.notice && (
        <p role="status" className={cn("text-xs", join.notice.tone === "error" ? "text-[var(--error)]" : "text-[var(--text-secondary)]")}>
          {join.notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={join.cancel}>
            Cancel join
          </button>
        ) : (
          clips.length > 1 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!!join.problem || engineBusy}
              onClick={() => void join.start()}
            >
              {`Join ${clips.length} clips`}
            </button>
          )
        )}
        {join.canUndo && !running && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={join.undo}>
            <Undo2 size={14} aria-hidden="true" />
            Undo join
          </button>
        )}
      </div>
      {!running && clips.length > 1 && join.problem && <p className="text-xs text-[var(--muted)]">{join.problem}</p>}
      {!running && engineBusy && clips.length > 1 && <p className="text-xs text-[var(--muted)]">Waiting for the current export to finish.</p>}
    </div>
  );
}
