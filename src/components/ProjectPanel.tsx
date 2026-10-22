"use client";

import { useRef, useState } from "react";
import { FolderOpen, Save, Trash2, HardDrive } from "lucide-react";
import { formatBytes } from "@/lib/ffmpeg";
import { MAX_PROJECT_FILE_BYTES } from "@/lib/project";
import type {
  PendingRecovery,
  ProjectImportResult,
  ProjectStorageStatus,
} from "@/hooks/useVideoEditor";

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatSavedAt(savedAt: number): string {
  return new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const actionClass =
  "inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[var(--border)] text-xs font-heading font-bold uppercase tracking-widest text-[var(--text)] hover:bg-[var(--border)] transition-colors";

interface PanelProps {
  hasFile: boolean;
  storageStatus: ProjectStorageStatus;
  disabled?: boolean;
  onBuildProjectFile: () => { fileName: string; contents: string };
  onImportProject: (contents: string) => ProjectImportResult;
  onDeleteSavedData: () => void;
}

/** Explains what is saved in this browser, and saves, opens or deletes it. */
export default function ProjectPanel({
  hasFile,
  storageStatus,
  disabled = false,
  onBuildProjectFile,
  onImportProject,
  onDeleteSavedData,
}: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSave = () => {
    const { fileName, contents } = onBuildProjectFile();
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage({ tone: "ok", text: `Saved ${fileName}. It holds your edits, not the video.` });
  };

  const handleOpen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_PROJECT_FILE_BYTES) {
      setMessage({ tone: "error", text: "That file is too large to be a Reframe project." });
      return;
    }
    let contents: string;
    try {
      contents = await chosen.text();
    } catch {
      setMessage({ tone: "error", text: "That file couldn't be read." });
      return;
    }
    const outcome = onImportProject(contents);
    setMessage(
      outcome.ok
        ? { tone: "ok", text: outcome.message }
        : { tone: "error", text: `Couldn't open the project. ${outcome.error}` }
    );
  };

  const sourceLine =
    storageStatus.sourceCopy === "saved"
      ? "A copy of the video is kept in this browser's storage so a refresh doesn't lose it."
      : storageStatus.sourceCopy === "failed"
        ? "This browser didn't have room to keep a copy of the video. After a refresh you'll be asked to choose it again."
        : storageStatus.sourceCopy === "saving"
          ? "Keeping a copy of the video in this browser's storage…"
          : null;

  return (
    <section
      aria-labelledby="project-panel-title"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
    >
      <h2
        id="project-panel-title"
        className="flex items-center gap-2 text-[10px] font-heading font-bold uppercase tracking-widest text-[var(--muted)]"
      >
        <HardDrive size={12} aria-hidden="true" />
        Saved on this device
      </h2>

      <div className="space-y-1.5 text-xs text-[var(--muted)] leading-relaxed">
        <p>
          Your edit settings are saved in this browser as you work, so you can pick up after a
          refresh. Nothing is uploaded.
        </p>
        {hasFile && sourceLine && <p>{sourceLine}</p>}
        {hasFile && storageStatus.savedAt && !storageStatus.error && (
          <p>Edits saved at {formatSavedAt(storageStatus.savedAt)}.</p>
        )}
        {storageStatus.error && <p className="text-[var(--error)]">{storageStatus.error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleSave} disabled={disabled} className={actionClass}>
          <Save size={13} aria-hidden="true" />
          Save project file
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={actionClass}
        >
          <FolderOpen size={13} aria-hidden="true" />
          Open project file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleOpen}
        />
      </div>

      <div aria-live="polite" className="text-xs">
        {message && (
          <p className={message.tone === "error" ? "text-[var(--error)]" : "text-[var(--text)]"}>
            {message.text}
          </p>
        )}
      </div>

      {confirmingDelete ? (
        <div className="rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-3 space-y-2">
          <p className="text-xs text-[var(--text)]">
            Delete the saved edits and the stored copy of the video from this browser, and close the
            current video? Project files you saved are not affected.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onDeleteSavedData();
                setConfirmingDelete(false);
                setMessage({ tone: "ok", text: "Saved data deleted. The editor has been reset." });
              }}
              className="min-h-[36px] px-3 rounded-lg bg-[var(--error)] text-white text-xs font-heading font-bold uppercase tracking-widest"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-[36px] px-3 rounded-lg border border-[var(--border)] text-xs font-heading font-bold uppercase tracking-widest text-[var(--text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-widest text-[var(--muted)] hover:text-[var(--error)] transition-colors"
        >
          <Trash2 size={12} aria-hidden="true" />
          Delete saved data
        </button>
      )}
    </section>
  );
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
      className="rounded-xl border border-film-200 bg-film-50 p-4 text-sm text-film-800 space-y-2"
    >
      <p className="font-heading font-bold">
        {recovery.origin === "session" ? "Pick up where you left off" : "Choose the project's video"}
      </p>
      <p className="text-film-700">
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
        className="text-xs font-heading font-bold uppercase tracking-widest text-film-600 hover:underline"
      >
        Discard saved edits
      </button>
    </div>
  );
}
