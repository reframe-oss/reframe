"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Film, FolderOpen, Info } from "lucide-react";
import LottiePlayer from "./LottiePlayer";
import uploadAnim from "@/lib/lottie/upload.json";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { MAX_FILE_SIZE, WARNING_FILE_SIZE } from "@/lib/types";

interface Props {
  onFileSelect: (file: File | null) => void;
  currentFile: File | null;
  fileError: string;
  duration: number;
}

function UploadRequirements() {
  return (
    <section
      aria-labelledby="upload-requirements-title"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-film-600"
        >
          <Info size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <h3
            id="upload-requirements-title"
            className="font-heading text-sm font-semibold text-[var(--text)]"
          >
            Upload requirements
          </h3>

          <p className="mt-1 text-xs text-[var(--muted)]">
            Check these details before choosing a video.
          </p>

          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-[var(--text)]">
                File size
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Up to {formatBytes(MAX_FILE_SIZE)}. Files over{" "}
                {formatBytes(WARNING_FILE_SIZE)} may process more slowly.
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold text-[var(--text)]">
                Supported formats
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
                MP4, MOV, AVI, MKV and WebM.
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold text-[var(--text)]">
                Best compatibility
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
                MP4 with H.264 video and AAC audio is recommended.
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold text-[var(--text)]">
                Processing
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Processing happens locally in your browser using FFmpeg.wasm.
              </dd>
            </div>
          </dl>

          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-5 text-[var(--muted)]">
            Large, high-resolution or complex videos can exceed browser memory,
            especially on devices with limited RAM. For smoother exports, close
            unused tabs and use the recommended MP4 format.
          </p>
        </div>
      </div>
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
  return (
    <div className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)]">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] shrink-0">
            <Film size={16} className="text-film-600" />
          </div>
          <Film size={18} className="lg:hidden text-film-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-[var(--text)] truncate max-w-[320px] xl:max-w-[420px]">
                {currentFile?.name}
              </p>
              {currentFile && (
                <span className="px-2 py-0.5 bg-[var(--accent-muted)] text-[var(--text)] font-bold tracking-wider rounded text-[10px] uppercase shrink-0">
                  {currentFile.name.includes(".")
                    ? currentFile.name.split(".").pop()
                    : "VIDEO"}
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1 space-y-0.5">
              <p>{formatBytes(currentFile?.size ?? 0)}</p>
              <p>
                {duration > 0
                  ? `Duration: ${formatDuration(duration)}`
                  : "Loading duration..."}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeClick}
          className="text-xs font-semibold text-film-600 hover:text-film-700 uppercase tracking-wide"
        >
          Change
          <span className="text-[var(--muted)] ml-1">(Ctrl+O)</span>
        </button>
      </div>

      <p className="text-xs text-[var(--muted)] mt-3 break-words">
        Supports: MP4, MOV, AVI, MKV, WebM, and most video formats
      </p>

      {fileError && (
        <p className="text-xs text-[var(--error)] mt-2 font-medium">{fileError}</p>
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
      aria-label="Video upload area. Drag and drop a video file or press Enter to browse."
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group flex flex-col items-center justify-center gap-4 py-12 px-6",
        "border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 relative overflow-hidden",
        dragging
          ? "border-[var(--accent)] bg-[var(--accent-muted)] scale-[1.02] shadow-[var(--shadow)] ring-4 ring-[var(--accent-muted)]"
          : "border-[var(--border)] bg-[var(--bg)] hover:border-film-400 hover:bg-film-50/40"
      )}
    >
      {dragging && (
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-film-500/20 to-transparent pointer-events-none" />
      )}

      <div className="w-20 h-20 opacity-80 group-hover:opacity-100 transition-opacity group-hover:scale-110 duration-200">
        <LottiePlayer animationData={uploadAnim} loop autoplay />
      </div>

      <div className="text-center">
        <p className="font-heading font-semibold text-[var(--text)] text-base">
          {dragging ? "Release to upload" : "Drag & Drop your video here"}
        </p>
        <p className="text-sm text-[var(--muted)] mt-1">or click to browse</p>
        <p className="text-xs text-[var(--muted)] mt-2 font-heading">
          Ctrl+O / Cmd+O
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm font-heading font-medium text-[var(--muted)]">
            <FolderOpen size={14} />
            MP4 / MOV / AVI / WebM
          </div>
          <p className="text-xs text-[var(--muted)]">Max file size: 2 GB</p>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-red-500">❌</span>
            {error}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--muted)] text-center">
        Supports: MP4, MOV, AVI, MKV, WebM, and most video formats up to 2GB
      </p>

      {fileError && (
        <p className="text-sm text-[var(--error)] text-center">{fileError}</p>
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
      setError("Please drop a valid video file (MP4, MOV, AVI, WebM, etc.)");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large (${formatBytes(file.size)}). Maximum allowed size is 2GB.`
      );
      return;
    }

    if (file.size > WARNING_FILE_SIZE) {
      const estimatedMinutes = Math.max(
        1,
        Math.round(file.size / (100 * 1024 * 1024))
      );
      setWarning(
        `Large file detected (${formatBytes(file.size)}). Processing may take ~${estimatedMinutes} minutes.`
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
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <>
      {/* ── Page-level drag overlay ── */}
      {pageDragging && (
        <div
          aria-live="polite"
          aria-label="Drop your video file anywhere on the page"
          className={cn(
            "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4",
            "bg-black/60 backdrop-blur-sm",
            "border-4 border-dashed border-film-500",
            "transition-all duration-200 pointer-events-none"
          )}
        >
          {/* Animated ring */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-32 h-32 rounded-full border-4 border-film-500/40 animate-ping" />
            <div className="w-24 h-24 rounded-full bg-film-500/10 border-2 border-film-500 flex items-center justify-center">
              <Film size={40} className="text-film-400" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              Drop your video anywhere
            </p>
            <p className="text-film-300 mt-1 text-sm">
              Release to start uploading
            </p>
          </div>
        </div>
      )}

      {/* ── Normal upload UI ── */}
      <div className="space-y-2">
        {error && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        )}
        {warning && (
          <p role="alert" className="text-sm text-[var(--warning)]">
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
          <div className="space-y-3">
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
