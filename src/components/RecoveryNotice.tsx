"use client";

import { formatBytes } from "@/lib/ffmpeg";
import type { PendingRecovery } from "@/hooks/useVideoEditor";

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface RecoveryProps {
  recovery: PendingRecovery;
  onDiscard: () => void;
}

/** Shown when a saved project's video has to be chosen again. */
export function RecoveryNotice({ recovery, onDiscard }: RecoveryProps) {
  const { source } = recovery;
  return (
    <div
      role="status"
      className="panel space-y-2 p-5 text-sm leading-6 text-[var(--text)]"
    >
      <p className="serif text-xl">
        {recovery.origin === "session" ? "Pick up where you left off" : "Choose the project's video"}
      </p>
      <p className="text-[var(--text-secondary)]">
        {recovery.origin === "session"
          ? "Your edits were saved, but this browser no longer has the video. "
          : "Project files don't include the video. "}
        Choose <strong>{source.name}</strong> ({formatBytes(source.size)}
        {source.duration > 0 ? `, ${formatDuration(source.duration)}` : ""}) below to continue with
        your edits. A different video starts with fresh trim points.
      </p>
      <button
        type="button"
        onClick={onDiscard}
        className="btn btn-ghost btn-sm -ml-3"
      >
        Discard saved edits
      </button>
    </div>
  );
}
