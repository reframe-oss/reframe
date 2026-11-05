"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FolderDown, Plus, RotateCcw, X } from "lucide-react";
import { formatBytes } from "@/lib/ffmpeg";
import { batchProgress, uniqueOutputNames } from "@/lib/batchExport";
import { canSaveToFolder, type BatchItem, type BatchSettings, type useBatchExport } from "@/hooks/useBatchExport";
import { cn } from "@/lib/utils";

interface Props {
  batch: ReturnType<typeof useBatchExport>;
  /** The edit to apply, read when the batch starts. */
  getSettings: () => BatchSettings;
  /** The editor's own export is running, so the engine is taken. */
  editorBusy: boolean;
}

const STATUS_TEXT: Record<BatchItem["status"], string> = {
  queued: "Waiting",
  exporting: "Exporting",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Applies the current edit to more videos: add files, export them one after
 * another, then download each or save them all to a folder.
 */
export default function BatchExport({ batch, getSettings, editorBusy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { items, running } = batch;
  const pending = items.filter((i) => i.status !== "done").length;
  const done = items.filter((i) => i.status === "done" && i.result);
  const names = uniqueOutputNames(items.map((i) => ({ name: i.file.name, format: i.result?.format ?? getSettings().recipe.format })));
  const overall = batchProgress(items);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-[var(--text-secondary)]">
        Export other videos with this edit: the same size, framing, format, crop, colour, audio and overlays. Each
        video keeps its full length, since trim points belong to this one. They export one at a time, on this device.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running) batch.add([...e.dataTransfer.files]);
        }}
        className={cn(
          "rounded-control border border-dashed border-[var(--border)] p-3 transition-colors duration-fast",
          dragging && "border-[var(--accent)] bg-[var(--surface-2)]"
        )}
      >
        <input
          ref={input}
          type="file"
          // Some players' files (.mkv, .mov) report no video type, so list them too.
          accept="video/*,.mkv,.mov"
          multiple
          className="sr-only"
          aria-label="Add videos to the batch"
          data-testid="batch-input"
          onChange={(e) => {
            batch.add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm w-full" disabled={running} onClick={() => input.current?.click()}>
          <Plus size={14} aria-hidden="true" />
          Add videos
        </button>
        <p className="mt-2 text-center text-2xs text-[var(--muted)]">or drop them here</p>
      </div>

      {batch.notice && (
        <p role="status" className="text-xs text-[var(--text-secondary)]">
          {batch.notice}
        </p>
      )}

      {items.length > 0 && (
        <>
          <ul aria-label="Videos in the batch" className="divide-y divide-[var(--border)] rounded-control border border-[var(--border)]">
            {items.map((item, index) => (
              <li key={item.id} className="space-y-1.5 px-3 py-2.5" data-status={item.status}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--text)]" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="tabular text-2xs text-[var(--muted)]">
                      {formatBytes(item.file.size)} ·{" "}
                      {item.status === "exporting" ? `${Math.round(item.progress)}%` : STATUS_TEXT[item.status]}
                      {item.status === "done" && item.result ? ` · ${formatBytes(item.result.size)}` : ""}
                    </p>
                  </div>
                  {item.status === "done" && item.result ? (
                    <a
                      href={item.result.blobUrl}
                      download={names[index]}
                      className="btn btn-ghost btn-sm"
                      aria-label={`Download ${names[index]}`}
                    >
                      <Download size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                  {item.status !== "exporting" && !running && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Remove ${item.file.name} from the batch`}
                      onClick={() => batch.remove(item.id)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {item.status === "exporting" && (
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`Exporting ${item.file.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.progress)}
                  >
                    <div className="progress-fill" style={{ transform: `scaleX(${Math.min(100, item.progress) / 100})` }} />
                  </div>
                )}
                {item.status === "failed" && item.error && <p className="text-2xs text-[var(--error)]">{item.error}</p>}
              </li>
            ))}
          </ul>

          {running && (
            <p className="tabular text-xs text-[var(--muted)]" aria-live="polite">
              {overall}% of the batch
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {running ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={batch.cancel}>
                Cancel batch
              </button>
            ) : pending > 0 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={editorBusy}
                onClick={() => void batch.start(getSettings())}
              >
                {items.some((i) => i.status === "failed" || i.status === "cancelled") ? (
                  <RotateCcw size={14} aria-hidden="true" />
                ) : null}
                {`Export ${pending} video${pending === 1 ? "" : "s"}`}
              </button>
            ) : null}
            {done.length > 0 && canSaveToFolder() && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={running} onClick={() => void batch.saveAllToFolder()}>
                <FolderDown size={14} aria-hidden="true" />
                Save all to a folder
              </button>
            )}
            {!running && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={batch.clear}>
                Clear list
              </button>
            )}
          </div>
          {done.length > 0 && !running && pending === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <CheckCircle2 size={14} aria-hidden="true" className="text-[var(--success)]" />
              {done.length} video{done.length === 1 ? "" : "s"} ready.
            </p>
          )}
          {editorBusy && !running && <p className="text-xs text-[var(--muted)]">Waiting for the current export to finish.</p>}
        </>
      )}
    </div>
  );
}
