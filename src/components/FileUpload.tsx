"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Film, Upload } from "lucide-react";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { MAX_FILE_SIZE, WARNING_FILE_SIZE } from "@/lib/types";

interface Props {
  onFileSelect: (file: File | null) => void;
  currentFile: File | null;
  fileError: string;
  duration: number;
}

/** Matches the extension check in useVideoEditor.handleFileSelect. */
const SUPPORTED_FORMATS = "MP4, MOV, WebM, MKV and AVI";

function UploadRequirements() {
  return (
    <section aria-labelledby="upload-requirements-title" className="px-1">
      <h2 id="upload-requirements-title" className="sr-only">
        Before you upload
      </h2>
      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium text-[var(--text)]">Formats</dt>
          <dd className="mt-0.5 leading-5 text-[var(--muted)]">
            {SUPPORTED_FORMATS}. MP4 with H.264 video and AAC audio is the most reliable.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text)]">File size</dt>
          <dd className="mt-0.5 leading-5 text-[var(--muted)]">
            Up to {formatBytes(MAX_FILE_SIZE)}. Export loads the whole file into browser memory, so files
            over {formatBytes(WARNING_FILE_SIZE)} can fail on devices with little RAM.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--text)]">Output</dt>
          <dd className="mt-0.5 leading-5 text-[var(--muted)]">
            MP4, WebM, MKV or GIF, sized for each platform or to your own dimensions.
          </dd>
        </div>
      </dl>
    </section>
  );
}

// ── File info (shown after upload) ─────────────────────
// Hoisted out of FileUpload: defining components inside a parent's body
// recreates them on every render, forcing React to remount their subtree
// (react-hooks/static-components) instead of reconciling it.
interface FileInfoProps {
  currentFile: File | null;
  duration: number;
  fileError: string;
  onChangeClick: () => void;
}

function FileInfo({ currentFile, duration, fileError, onChangeClick }: FileInfoProps) {
  const ext = currentFile?.name.includes(".") ? currentFile.name.split(".").pop() : "video";
  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[var(--surface-2)] text-[var(--text-secondary)]"
        >
          <Film size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text)]" title={currentFile?.name}>
            {currentFile?.name}
          </p>
          <p className="tabular text-xs text-[var(--muted)]">
            <span className="uppercase">{ext}</span>
            {" · "}
            {formatBytes(currentFile?.size ?? 0)}
            {" · "}
            {duration > 0 ? formatDuration(duration) : "Reading duration…"}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeClick}
          className="btn btn-secondary btn-sm shrink-0"
          title="Choose a different video (Ctrl+O)"
        >
          Replace video
        </button>
      </div>

      {fileError && (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--error)]">
          {fileError}
        </p>
      )}
    </div>
  );
}

// ── Drop zone (shown before upload) ─────────────────────
interface DropZoneProps {
  dragging: boolean;
  error: string;
  fileError: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function DropZone({
  dragging,
  error,
  fileError,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onKeyDown,
}: DropZoneProps) {
  return (
    <div
      id="upload-zone"
      role="button"
      tabIndex={0}
      // Named by its visible text so voice-control users can say what they see.
      aria-labelledby="upload-zone-title"
      aria-describedby="upload-zone-hint"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-panel border border-dashed px-6 py-14 text-center",
        "transition-[background-color,border-color] duration-fast",
        dragging
          ? "border-[var(--accent)] bg-[var(--accent-muted)]"
          : "border-[var(--border-strong)] bg-[var(--surface-2)] hover:border-[var(--text-secondary)]"
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)] shadow-[var(--shadow)]"
      >
        <Upload size={18} />
      </div>
      <div>
        <p id="upload-zone-title" className="text-base font-medium text-[var(--text)]">
          {dragging ? "Drop to open this video" : "Choose a video or drag it here"}
        </p>
        <p id="upload-zone-hint" className="mt-1 text-sm text-[var(--muted)]">
          {SUPPORTED_FORMATS} up to {formatBytes(MAX_FILE_SIZE)}{" "}
          <span className="hidden sm:inline">
            · <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">O</kbd>
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className="callout callout-error mt-1 text-xs">
          {error}
        </p>
      )}
      {fileError && (
        <p role="alert" className="text-sm text-[var(--error)]">
          {fileError}
        </p>
      )}
    </div>
  );
}

export default function FileUpload({
  onFileSelect,
  currentFile,
  fileError,
  duration,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [pageDragging, setPageDragging] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const dragCounterRef = useRef(0);

  // ── Keyboard shortcut Ctrl+O ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        inputRef.current?.click();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── File validation ───────────────────────────────────
  // Declared before the drag-and-drop effect below, which depends on it —
  // referencing it earlier (as it was previously) meant the effect's `[]`
  // dependency array (with exhaustive-deps silenced) captured whatever
  // handleFile was on mount and never picked up a later one if onFileSelect
  // ever changed identity.
  const handleFile = useCallback((file: File) => {
    setError("");
    setWarning("");

    if (!file.type.startsWith("video/")) {
      setError(`That file isn't a video. Choose a ${SUPPORTED_FORMATS} file.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        `This file is ${formatBytes(file.size)}. The maximum is ${formatBytes(MAX_FILE_SIZE)}.`
      );
      return;
    }

    if (file.size > WARNING_FILE_SIZE) {
      // No time estimate: export speed depends on codec, resolution and
      // device far more than on file size, and it hasn't been measured.
      setWarning(
        `Large file (${formatBytes(file.size)}). Export can take several minutes and may fail on devices with limited memory.`
      );
    }

    onFileSelect(file);
  }, [onFileSelect]);

  // ── Page-level drag overlay ───────────────────────────
  // Uses a counter so nested dragenter/dragleave don't flicker
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setPageDragging(true);
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) setPageDragging(false);
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault(); // required to allow drop
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setPageDragging(false);

      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  // ── Drop zone (inner) handler ─────────────────────────
  // Only resets the zone's highlight: the drop bubbles to the document-level
  // listener above, which handles the file. Handling it here as well ran
  // validation and metadata extraction twice for every drop on the zone.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  return (
    <>
      {/* ── Page-level drag overlay ── */}
      {pageDragging && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
        >
          <div className="flex flex-col items-center gap-3 rounded-panel border-2 border-dashed border-white/70 px-10 py-8 text-center text-white">
            <Film size={28} aria-hidden="true" />
            <p className="text-xl font-semibold">Drop to open this video</p>
          </div>
        </div>
      )}

      {/* ── Normal upload UI ── */}
      <div className="space-y-2">
        {error && currentFile && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        )}
        {warning && (
          <p role="status" className="callout callout-warning text-xs">
            {warning}
          </p>
        )}
        {currentFile ? (
          <FileInfo
            currentFile={currentFile}
            duration={duration}
            fileError={fileError}
            onChangeClick={() => inputRef.current?.click()}
          />
        ) : (
          <div className="space-y-5">
            <DropZone
              dragging={dragging}
              error={error}
              fileError={fileError}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  inputRef.current?.click();
                }
              }}
            />
            <UploadRequirements />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
    </>
  );
}
